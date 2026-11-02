//! Hosting accounts (Bitbucket Cloud, Bitbucket Server), SSH keys and remote repo listing.
//!
//! Secrets are stored in the system keyring (Secret Service, e.g. GNOME Keyring or KWallet).
//! If no keyring is available they fall back to `~/.config/stlinux/accounts.json` (mode 0600).
//! They are never sent to the front end after they are saved.

use crate::git::blocking;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::{Command, Stdio};

const CLOUD_API: &str = "https://api.bitbucket.org/2.0";
const CLOUD_ORIGIN: &str = "https://bitbucket.org";
/// Username Bitbucket Cloud expects for Git over HTTPS when an API token is the password.
const CLOUD_GIT_USER: &str = "x-bitbucket-api-token-auth";

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Stored {
    id: String,
    kind: String, // "bitbucket-cloud" | "bitbucket-server"
    root_url: String,
    username: String,
    git_username: String,
    /// Only used when the system keyring is unavailable (or for old files). Empty otherwise.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    secret: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub kind: String,
    pub root_url: String,
    pub username: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshKey {
    pub name: String,
    pub path: String,
    pub public_key: String,
    pub fingerprint: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Startup {
    pub accounts: Vec<Account>,
    pub ssh_keys: Vec<SshKey>,
    /// keys found in ~/.ssh that the user removed from STLinux (kept on disk)
    pub hidden_keys: usize,
    pub agent_has_keys: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteRepo {
    pub name: String,
    pub full_name: String,
    pub description: String,
    pub https_url: String,
    pub ssh_url: String,
    pub private: bool,
    pub updated: String,
}

// ---------------------------------------------------------------- storage

fn config_dir() -> PathBuf {
    if let Some(x) = std::env::var_os("XDG_CONFIG_HOME") {
        return PathBuf::from(x).join("stlinux");
    }
    PathBuf::from(std::env::var_os("HOME").unwrap_or_default())
        .join(".config")
        .join("stlinux")
}

fn store_path() -> PathBuf {
    config_dir().join("accounts.json")
}

const KEYRING_SERVICE: &str = "stlinux";

fn keyring_entry(id: &str) -> Option<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, id).ok()
}

/// Reads the account list. Secrets come from the system keyring; a secret still found
/// in the file (older versions, or no keyring) is used and moved to the keyring on save.
fn load() -> Vec<Stored> {
    let mut list: Vec<Stored> = std::fs::read_to_string(store_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    for a in list.iter_mut() {
        if a.secret.is_empty() {
            if let Some(pw) = keyring_entry(&a.id).and_then(|e| e.get_password().ok()) {
                a.secret = pw;
            }
        }
    }
    list
}

/// Saves accounts. Each secret goes to the keyring; only if that fails is it kept in the
/// 0600 file, so the user never loses a login.
fn save(list: &[Stored]) -> Result<(), String> {
    use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
    let on_disk: Vec<Stored> = list
        .iter()
        .map(|a| {
            let mut c = a.clone();
            let stored = !a.secret.is_empty()
                && keyring_entry(&a.id)
                    .map(|e| e.set_password(&a.secret).is_ok())
                    .unwrap_or(false);
            if stored {
                c.secret.clear();
            }
            c
        })
        .collect();
    std::fs::create_dir_all(config_dir()).map_err(|e| e.to_string())?;
    let p = store_path();
    let data = serde_json::to_string_pretty(&on_disk).map_err(|e| e.to_string())?;
    let mut f = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(&p)
        .map_err(|e| e.to_string())?;
    std::io::Write::write_all(&mut f, data.as_bytes()).map_err(|e| e.to_string())?;
    std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())
}

fn forget_secret(id: &str) {
    if let Some(e) = keyring_entry(id) {
        let _ = e.delete_credential();
    }
}

fn public(s: &Stored) -> Account {
    Account {
        id: s.id.clone(),
        kind: s.kind.clone(),
        root_url: s.root_url.clone(),
        username: s.username.clone(),
    }
}

fn basic(user: &str, secret: &str) -> String {
    format!(
        "Basic {}",
        base64::engine::general_purpose::STANDARD.encode(format!("{user}:{secret}"))
    )
}

// ---------------------------------------------------------------- url helpers

/// "https://host:port/path" -> "https://host:port"
fn origin_of(url: &str) -> Option<String> {
    let (scheme, rest) = url.split_once("://")?;
    if scheme != "https" && scheme != "http" {
        return None;
    }
    let host = rest.split('/').next()?;
    let host = host.rsplit('@').next()?; // drop user info
    Some(format!("{scheme}://{}", host.to_lowercase()))
}

fn strip_userinfo(url: &str) -> String {
    match url.split_once("://") {
        Some((s, rest)) => {
            let (host, tail) = match rest.split_once('/') {
                Some((h, t)) => (h, format!("/{t}")),
                None => (rest, String::new()),
            };
            format!("{s}://{}{}", host.rsplit('@').next().unwrap_or(host), tail)
        }
        None => url.to_string(),
    }
}

/// Returns (config key, header value) scoped to the remote's origin, if we hold an account for it.
pub fn auth_config_for_url(url: &str) -> Option<(String, String)> {
    let origin = origin_of(url)?;
    let acct = load().into_iter().find(|a| {
        let o = if a.kind == "bitbucket-cloud" {
            Some(CLOUD_ORIGIN.to_string())
        } else {
            origin_of(&a.root_url)
        };
        o.as_deref() == Some(origin.as_str())
    })?;
    let user = if acct.git_username.is_empty() { &acct.username } else { &acct.git_username };
    Some((
        format!("http.{origin}/.extraHeader"),
        format!("Authorization: {}", basic(user, &acct.secret)),
    ))
}

// ---------------------------------------------------------------- SSH

fn ssh_dir() -> PathBuf {
    PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".ssh")
}

fn fingerprint(pub_path: &std::path::Path) -> String {
    Command::new("ssh-keygen")
        .arg("-lf")
        .arg(pub_path)
        .stdin(Stdio::null())
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default()
}

fn scan_keys(dir: &std::path::Path) -> Vec<SshKey> {
    let mut v = vec![];
    let Ok(rd) = std::fs::read_dir(dir) else { return v };
    for e in rd.flatten() {
        let p = e.path();
        if p.extension().and_then(|x| x.to_str()) != Some("pub") {
            continue;
        }
        let Ok(content) = std::fs::read_to_string(&p) else { continue };
        v.push(SshKey {
            name: p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default(),
            path: p.with_extension("").to_string_lossy().into_owned(),
            public_key: content.trim().to_string(),
            fingerprint: fingerprint(&p),
        });
    }
    v.sort_by(|a, b| a.name.cmp(&b.name));
    v
}

fn agent_has_keys() -> bool {
    Command::new("ssh-add")
        .arg("-l")
        .stdin(Stdio::null())
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

// ---- keys the user removed from STLinux (the files stay on disk)

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct Settings {
    #[serde(default)]
    ignored_keys: Vec<String>,
}

fn settings_path() -> PathBuf {
    config_dir().join("settings.json")
}

fn load_settings(p: &std::path::Path) -> Settings {
    std::fs::read_to_string(p)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_settings(p: &std::path::Path, s: &Settings) -> Result<(), String> {
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(s).map_err(|e| e.to_string())?;
    std::fs::write(p, data).map_err(|e| e.to_string())
}

/// Returns (visible keys, number hidden).
fn visible_keys(dir: &std::path::Path, settings: &Settings) -> (Vec<SshKey>, usize) {
    let all = scan_keys(dir);
    let total = all.len();
    let shown: Vec<SshKey> = all
        .into_iter()
        .filter(|k| !settings.ignored_keys.contains(&k.path))
        .collect();
    let hidden = total - shown.len();
    (shown, hidden)
}

/// A key we may touch: a private key file directly inside `dir` that has a matching `.pub`,
/// and neither file is a symbolic link.
fn checked_key(dir: &std::path::Path, key_path: &str) -> Result<(PathBuf, PathBuf), String> {
    let p = PathBuf::from(key_path);
    let name = p.file_name().and_then(|n| n.to_str()).ok_or("Invalid key path")?.to_string();
    if name.ends_with(".pub") || name.contains('/') || name.starts_with('.') {
        return Err("Invalid key path".into());
    }
    let parent = p.parent().ok_or("Invalid key path")?;
    let same_dir = match (parent.canonicalize(), dir.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    };
    if !same_dir {
        return Err("That file is not in your SSH folder".into());
    }
    let pub_path = dir.join(format!("{name}.pub"));
    let priv_path = dir.join(&name);
    for f in [&pub_path, &priv_path] {
        let m = std::fs::symlink_metadata(f).map_err(|_| "Key files were not found".to_string())?;
        if m.file_type().is_symlink() || !m.is_file() {
            return Err("Refusing to touch a link or a folder".into());
        }
    }
    Ok((priv_path, pub_path))
}

fn forget_key_in(dir: &std::path::Path, settings_file: &std::path::Path, key_path: &str) -> Result<(), String> {
    checked_key(dir, key_path)?;
    let mut st = load_settings(settings_file);
    if !st.ignored_keys.iter().any(|k| k == key_path) {
        st.ignored_keys.push(key_path.to_string());
    }
    save_settings(settings_file, &st)
}

fn delete_key_in(dir: &std::path::Path, settings_file: &std::path::Path, key_path: &str) -> Result<(), String> {
    let (priv_path, pub_path) = checked_key(dir, key_path)?;
    std::fs::remove_file(&priv_path).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&pub_path);
    let mut st = load_settings(settings_file);
    st.ignored_keys.retain(|k| k != key_path);
    save_settings(settings_file, &st)
}

#[tauri::command]
pub async fn ssh_forget(path: String) -> Result<(), String> {
    blocking(move || forget_key_in(&ssh_dir(), &settings_path(), &path)).await
}

#[tauri::command]
pub async fn ssh_restore_hidden() -> Result<(), String> {
    blocking(|| {
        let mut st = load_settings(&settings_path());
        st.ignored_keys.clear();
        save_settings(&settings_path(), &st)
    })
    .await
}

#[tauri::command]
pub async fn ssh_delete(path: String) -> Result<(), String> {
    blocking(move || delete_key_in(&ssh_dir(), &settings_path(), &path)).await
}

/// Moves any secret still sitting in the file (older versions) into the keyring.
fn migrate_secrets() {
    let raw = std::fs::read_to_string(store_path()).unwrap_or_default();
    if raw.contains("\"secret\"") {
        let list = load();
        let _ = save(&list);
    }
}

#[tauri::command]
pub async fn startup() -> Result<Startup, String> {
    blocking(|| {
        migrate_secrets();
        let (ssh_keys, hidden_keys) = visible_keys(&ssh_dir(), &load_settings(&settings_path()));
        Ok(Startup {
            accounts: load().iter().map(public).collect(),
            ssh_keys,
            hidden_keys,
            agent_has_keys: agent_has_keys(),
        })
    })
    .await
}

#[tauri::command]
pub async fn ssh_generate(name: String, comment: String, passphrase: String) -> Result<SshKey, String> {
    blocking(move || {
        if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
            return Err("Key name can only use letters, numbers, - and _".into());
        }
        let dir = ssh_dir();
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let file = dir.join(&name);
        if file.exists() {
            return Err(format!("{} already exists", file.display()));
        }
        let o = Command::new("ssh-keygen")
            .args(["-t", "ed25519", "-q", "-f"])
            .arg(&file)
            .args(["-N", &passphrase, "-C", &comment])
            .stdin(Stdio::null())
            .output()
            .map_err(|e| format!("ssh-keygen is not available ({e})"))?;
        if !o.status.success() {
            return Err(String::from_utf8_lossy(&o.stderr).trim().to_string());
        }
        let pubp = file.with_extension("pub");
        let pubp = if pubp.exists() { pubp } else { PathBuf::from(format!("{}.pub", file.display())) };
        Ok(SshKey {
            name,
            path: file.to_string_lossy().into_owned(),
            public_key: std::fs::read_to_string(&pubp).unwrap_or_default().trim().to_string(),
            fingerprint: fingerprint(&pubp),
        })
    })
    .await
}

#[tauri::command]
pub async fn ssh_test(host: String) -> Result<String, String> {
    blocking(move || {
        if host.starts_with('-') || host.contains(char::is_whitespace) {
            return Err("Invalid host".into());
        }
        let o = Command::new("ssh")
            .args(["-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=10"])
            .arg(format!("git@{host}"))
            .stdin(Stdio::null())
            .output()
            .map_err(|e| format!("ssh is not available ({e})"))?;
        let text = format!(
            "{}{}",
            String::from_utf8_lossy(&o.stdout),
            String::from_utf8_lossy(&o.stderr)
        );
        let text = text.trim().to_string();
        // Bitbucket answers with exit code 0 or 1 on success, 255 on connection or auth failure.
        if o.status.code() == Some(255) || text.to_lowercase().contains("permission denied") {
            Err(text)
        } else {
            Ok(text)
        }
    })
    .await
}

// ---------------------------------------------------------------- accounts

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("STLinux/0.1")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())
}

fn clean_root(root: &str) -> Result<String, String> {
    let r = root.trim().trim_end_matches('/').to_string();
    if !(r.starts_with("https://") || r.starts_with("http://")) {
        return Err("Root URL must start with https:// or http://".into());
    }
    Ok(r)
}

#[tauri::command]
pub async fn add_account(
    kind: String,
    root_url: String,
    username: String,
    secret: String,
) -> Result<Account, String> {
    let username = username.trim().to_string();
    if username.is_empty() || secret.is_empty() {
        return Err("Enter a username and a token".into());
    }
    let c = client()?;
    let stored = match kind.as_str() {
        "bitbucket-cloud" => {
            let r = c
                .get(format!("{CLOUD_API}/user"))
                .header("Authorization", basic(&username, &secret))
                .send()
                .await
                .map_err(|e| format!("Could not reach Bitbucket: {e}"))?;
            if !r.status().is_success() {
                return Err(format!(
                    "Bitbucket rejected these details (HTTP {}). Use your Atlassian email and an API token.",
                    r.status().as_u16()
                ));
            }
            Stored {
                id: format!("bitbucket-cloud:{username}"),
                kind,
                root_url: CLOUD_ORIGIN.into(),
                username,
                git_username: CLOUD_GIT_USER.into(),
                secret,
            }
        }
        "bitbucket-server" => {
            let root = clean_root(&root_url)?;
            let r = c
                .get(format!("{root}/rest/api/1.0/projects?limit=1"))
                .header("Authorization", format!("Bearer {secret}"))
                .send()
                .await
                .map_err(|e| format!("Could not reach the server: {e}"))?;
            if !r.status().is_success() {
                return Err(format!(
                    "The server rejected this token (HTTP {}).",
                    r.status().as_u16()
                ));
            }
            Stored {
                id: format!("bitbucket-server:{}:{username}", origin_of(&root).unwrap_or_default()),
                kind,
                root_url: root,
                git_username: username.clone(),
                username,
                secret,
            }
        }
        _ => return Err("Unknown account type".into()),
    };
    let out = public(&stored);
    let mut list = load();
    list.retain(|a| a.id != stored.id);
    list.push(stored);
    blocking(move || save(&list)).await?;
    Ok(out)
}

#[tauri::command]
pub async fn remove_account(id: String) -> Result<(), String> {
    blocking(move || {
        let mut list = load();
        list.retain(|a| a.id != id);
        forget_secret(&id);
        save(&list)
    })
    .await
}

/// Checks that a saved account still works. Returns a short human message.
#[tauri::command]
pub async fn check_account(id: String) -> Result<String, String> {
    let acct = load().into_iter().find(|a| a.id == id).ok_or("Account not found")?;
    if acct.secret.is_empty() {
        return Err("The saved token could not be read. Log in again.".into());
    }
    let c = client()?;
    if acct.kind == "bitbucket-cloud" {
        let r = c
            .get(format!("{CLOUD_API}/user"))
            .header("Authorization", basic(&acct.username, &acct.secret))
            .send()
            .await
            .map_err(|e| format!("Could not reach Bitbucket: {e}"))?;
        if !r.status().is_success() {
            return Err(format!("Bitbucket rejected the saved token (HTTP {}). Log in again.", r.status().as_u16()));
        }
        let v: serde_json::Value = r.json().await.unwrap_or_default();
        let name = v.get("display_name").and_then(|x| x.as_str()).unwrap_or(&acct.username);
        Ok(format!("Connected as {name}"))
    } else {
        let r = c
            .get(format!("{}/rest/api/1.0/projects?limit=1", acct.root_url))
            .header("Authorization", format!("Bearer {}", acct.secret))
            .send()
            .await
            .map_err(|e| format!("Could not reach the server: {e}"))?;
        if !r.status().is_success() {
            return Err(format!("The server rejected the saved token (HTTP {}). Log in again.", r.status().as_u16()));
        }
        Ok("Connected".into())
    }
}

#[derive(Deserialize)]
struct CloudPage {
    #[serde(default)]
    values: Vec<serde_json::Value>,
    next: Option<String>,
}

fn s(v: &serde_json::Value, k: &str) -> String {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string()
}

#[tauri::command]
pub async fn list_remote_repos(account_id: String) -> Result<Vec<RemoteRepo>, String> {
    let acct = load()
        .into_iter()
        .find(|a| a.id == account_id)
        .ok_or("Account not found")?;
    let c = client()?;
    let mut out = vec![];
    if acct.kind == "bitbucket-cloud" {
        let mut url = Some(format!("{CLOUD_API}/repositories?role=member&pagelen=100&sort=-updated_on"));
        let mut pages = 0;
        while let Some(u) = url {
            pages += 1;
            let r = c
                .get(&u)
                .header("Authorization", basic(&acct.username, &acct.secret))
                .send()
                .await
                .map_err(|e| e.to_string())?;
            if !r.status().is_success() {
                return Err(format!("Bitbucket returned HTTP {}", r.status().as_u16()));
            }
            let page: CloudPage = r.json().await.map_err(|e| e.to_string())?;
            for v in page.values {
                let clones = v.pointer("/links/clone").and_then(|x| x.as_array()).cloned().unwrap_or_default();
                let find = |n: &str| {
                    clones.iter().find(|c| s(c, "name") == n).map(|c| s(c, "href")).unwrap_or_default()
                };
                out.push(RemoteRepo {
                    name: s(&v, "name"),
                    full_name: s(&v, "full_name"),
                    description: s(&v, "description"),
                    https_url: strip_userinfo(&find("https")),
                    ssh_url: find("ssh"),
                    private: v.get("is_private").and_then(|x| x.as_bool()).unwrap_or(false),
                    updated: s(&v, "updated_on"),
                });
            }
            url = if pages < 10 { page.next } else { None };
        }
    } else {
        let mut start = 0u64;
        loop {
            let r = c
                .get(format!("{}/rest/api/1.0/repos?limit=100&start={start}", acct.root_url))
                .header("Authorization", format!("Bearer {}", acct.secret))
                .send()
                .await
                .map_err(|e| e.to_string())?;
            if !r.status().is_success() {
                return Err(format!("The server returned HTTP {}", r.status().as_u16()));
            }
            let v: serde_json::Value = r.json().await.map_err(|e| e.to_string())?;
            for repo in v.get("values").and_then(|x| x.as_array()).cloned().unwrap_or_default() {
                let clones = repo.pointer("/links/clone").and_then(|x| x.as_array()).cloned().unwrap_or_default();
                let find = |n: &str| {
                    clones.iter().find(|c| s(c, "name") == n).map(|c| s(c, "href")).unwrap_or_default()
                };
                let key = repo.pointer("/project/key").and_then(|x| x.as_str()).unwrap_or("").to_string();
                out.push(RemoteRepo {
                    name: s(&repo, "name"),
                    full_name: format!("{}/{}", key, s(&repo, "slug")),
                    description: s(&repo, "description"),
                    https_url: strip_userinfo(&find("http")),
                    ssh_url: find("ssh"),
                    private: !repo.get("public").and_then(|x| x.as_bool()).unwrap_or(false),
                    updated: String::new(),
                });
            }
            if v.get("isLastPage").and_then(|x| x.as_bool()).unwrap_or(true) || start > 5000 {
                break;
            }
            start = v.get("nextPageStart").and_then(|x| x.as_u64()).unwrap_or(start + 100);
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn origin_and_userinfo_helpers() {
        assert_eq!(origin_of("https://Bitbucket.org/team/repo.git").as_deref(), Some("https://bitbucket.org"));
        assert_eq!(origin_of("https://user@host.example:7990/scm/a/b.git").as_deref(), Some("https://host.example:7990"));
        assert_eq!(origin_of("git@bitbucket.org:team/repo.git"), None);
        assert_eq!(strip_userinfo("http://user@host/scm/a.git"), "http://host/scm/a.git");
    }

    fn fake_key(dir: &std::path::Path, name: &str) {
        std::fs::write(dir.join(name), "PRIVATE").unwrap();
        std::fs::write(dir.join(format!("{name}.pub")), "ssh-ed25519 AAAA test").unwrap();
    }

    fn tmpdir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("stlinux-ssh-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn forget_hides_key_but_keeps_files_then_restore() {
        let d = tmpdir("forget");
        fake_key(&d, "id_a");
        fake_key(&d, "id_b");
        let sf = d.join("settings.json");
        let key = d.join("id_a").to_string_lossy().into_owned();
        forget_key_in(&d, &sf, &key).unwrap();
        let (shown, hidden) = visible_keys(&d, &load_settings(&sf));
        assert_eq!((shown.len(), hidden), (1, 1));
        assert_eq!(shown[0].name, "id_b");
        assert!(d.join("id_a").exists(), "files must stay on disk");
        // forgetting twice does not duplicate
        forget_key_in(&d, &sf, &key).unwrap();
        assert_eq!(load_settings(&sf).ignored_keys.len(), 1);
        save_settings(&sf, &Settings::default()).unwrap();
        assert_eq!(visible_keys(&d, &load_settings(&sf)).0.len(), 2);
    }

    #[test]
    fn delete_removes_both_files_only_inside_ssh_dir() {
        let d = tmpdir("delete");
        fake_key(&d, "id_a");
        let sf = d.join("settings.json");
        let key = d.join("id_a").to_string_lossy().into_owned();
        delete_key_in(&d, &sf, &key).unwrap();
        assert!(!d.join("id_a").exists() && !d.join("id_a.pub").exists());
        // outside the ssh dir
        let other = tmpdir("delete-other");
        fake_key(&other, "id_x");
        let outside = other.join("id_x").to_string_lossy().into_owned();
        assert!(delete_key_in(&d, &sf, &outside).is_err());
        assert!(other.join("id_x").exists());
        // pub files, hidden files, missing pub and traversal are refused
        assert!(delete_key_in(&d, &sf, &d.join("id_a.pub").to_string_lossy()).is_err());
        assert!(delete_key_in(&d, &sf, &format!("{}/../x", d.display())).is_err());
        std::fs::write(d.join("lonely"), "x").unwrap();
        assert!(delete_key_in(&d, &sf, &d.join("lonely").to_string_lossy()).is_err());
        assert!(d.join("lonely").exists());
    }

    #[test]
    fn delete_refuses_symlinks() {
        let d = tmpdir("symlink");
        let target = tmpdir("symlink-target");
        std::fs::write(target.join("real"), "x").unwrap();
        std::os::unix::fs::symlink(target.join("real"), d.join("id_link")).unwrap();
        std::fs::write(d.join("id_link.pub"), "pub").unwrap();
        let sf = d.join("settings.json");
        assert!(delete_key_in(&d, &sf, &d.join("id_link").to_string_lossy()).is_err());
        assert!(target.join("real").exists());
    }

    #[test]
    fn keyring_roundtrip_if_available() {
        let id = format!("stlinux-test-{}", std::process::id());
        let Some(e) = keyring_entry(&id) else { return };
        if e.set_password("s3cret").is_err() {
            eprintln!("no Secret Service available, skipping");
            return;
        }
        assert_eq!(e.get_password().unwrap(), "s3cret");
        e.delete_credential().unwrap();
        assert!(e.get_password().is_err());
    }
}
