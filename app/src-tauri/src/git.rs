//! Git engine. Every operation shells out to the real `git` binary.
//! The front end never sends raw git arguments: each command below builds its own.

use crate::accounts;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::process::{Command, Stdio};

const MAX_DIFF_BYTES: usize = 2 * 1024 * 1024;

pub async fn blocking<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------- plumbing

fn base(repo: Option<&str>, pre: &[String]) -> Command {
    let mut c = Command::new("git");
    if let Some(r) = repo {
        c.arg("-C").arg(r);
    }
    for p in pre {
        c.arg(p);
    }
    c.env("GIT_TERMINAL_PROMPT", "0")
        .env("LC_ALL", "C")
        .env("GIT_EDITOR", "true")
        .env("GIT_MERGE_AUTOEDIT", "no")
        .stdin(Stdio::null());
    if std::env::var_os("GIT_SSH_COMMAND").is_none() {
        c.env(
            "GIT_SSH_COMMAND",
            "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new",
        );
    }
    c
}

struct Out {
    code: i32,
    stdout: String,
    stderr: String,
}

fn exec(mut c: Command) -> Result<Out, String> {
    let o = c
        .output()
        .map_err(|e| format!("Could not run git. Is it installed? ({e})"))?;
    Ok(Out {
        code: o.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&o.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&o.stderr).into_owned(),
    })
}

fn fail(o: &Out) -> String {
    let mut s = o.stderr.trim().to_string();
    let so = o.stdout.trim();
    if !so.is_empty() {
        if !s.is_empty() {
            s.push('\n');
        }
        s.push_str(so);
    }
    if s.is_empty() {
        format!("git exited with code {}", o.code)
    } else {
        s
    }
}

fn run(repo: &str, args: &[&str]) -> Result<String, String> {
    let mut c = base(Some(repo), &[]);
    c.args(args);
    let o = exec(c)?;
    if o.code == 0 {
        Ok(o.stdout)
    } else {
        Err(fail(&o))
    }
}

/// Like `run`, but returns stdout plus stderr (progress text) on success.
fn run_all(repo: &str, pre: &[String], args: &[&str]) -> Result<String, String> {
    let mut c = base(Some(repo), pre);
    c.args(args);
    let o = exec(c)?;
    if o.code == 0 {
        Ok(format!("{}{}", o.stdout, o.stderr).trim().to_string())
    } else {
        Err(fail(&o))
    }
}

fn run_stdin(repo: &str, args: &[&str], input: &str) -> Result<String, String> {
    let mut c = base(Some(repo), &[]);
    c.args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = c.spawn().map_err(|e| e.to_string())?;
    child
        .stdin
        .take()
        .ok_or("no stdin")?
        .write_all(input.as_bytes())
        .map_err(|e| e.to_string())?;
    let o = child.wait_with_output().map_err(|e| e.to_string())?;
    let out = Out {
        code: o.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&o.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&o.stderr).into_owned(),
    };
    if out.code == 0 {
        Ok(out.stdout)
    } else {
        Err(fail(&out))
    }
}

fn has_head(repo: &str) -> bool {
    run(repo, &["rev-parse", "--verify", "-q", "HEAD"]).is_ok()
}

/// Per-origin auth headers for the remotes of a repo (scoped, never global).
fn net_pre(repo: &str) -> Vec<String> {
    let urls = run(repo, &["remote", "-v"]).unwrap_or_default();
    let mut pre = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    for line in urls.lines() {
        if let Some(url) = line.split_whitespace().nth(1) {
            if let Some(p) = accounts::auth_config_for_url(url) {
                if !seen.contains(&p.0) {
                    seen.push(p.0.clone());
                    pre.push("-c".into());
                    pre.push(format!("{}={}", p.0, p.1));
                }
            }
        }
    }
    pre
}

fn ensure_not_flag(s: &str) -> Result<(), String> {
    if s.starts_with('-') {
        Err(format!("Invalid value: {s}"))
    } else {
        Ok(())
    }
}

// ---------------------------------------------------------------- types

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    pub path: String,
    pub name: String,
    pub branch: String,
    pub detached: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub branch: String,
    pub detached: bool,
    pub pending: usize,
    pub ahead: u32,
    pub behind: u32,
    pub has_upstream: bool,
    pub has_remote: bool,
    pub merging: bool,
    pub rebasing: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub path: String,
    pub orig: Option<String>,
    /// index (staged) status letter, ' ' when none
    pub index: String,
    /// worktree (unstaged) status letter, ' ' when none, '?' untracked
    pub worktree: String,
    pub conflicted: bool,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub full: String,
    pub upstream: String,
    pub ahead: u32,
    pub behind: u32,
    pub current: bool,
    pub sha: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stash {
    pub name: String,
    pub message: String,
    pub sha: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Remote {
    pub name: String,
    pub url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Refs {
    pub local: Vec<Branch>,
    pub remote: Vec<Branch>,
    pub tags: Vec<Branch>,
    pub stashes: Vec<Stash>,
    pub remotes: Vec<Remote>,
    pub submodules: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub sha: String,
    pub parents: Vec<String>,
    pub author: String,
    pub email: String,
    pub date: i64,
    pub refs: Vec<String>,
    pub subject: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetails {
    pub sha: String,
    pub parents: Vec<String>,
    pub author: String,
    pub email: String,
    pub date: i64,
    pub committer: String,
    pub committer_email: String,
    pub committer_date: i64,
    pub message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub status: String,
    pub path: String,
    pub orig: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogOpts {
    pub limit: u32,
    pub skip: u32,
    pub all: bool,
    pub branches: Vec<String>,
    pub topo: bool,
    pub search_kind: Option<String>,
    pub query: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitOpts {
    pub message: String,
    pub amend: bool,
    pub no_verify: bool,
    pub signoff: bool,
    pub author: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushOpts {
    pub remote: String,
    pub branch: String,
    pub remote_branch: Option<String>,
    pub tags: bool,
    pub set_upstream: bool,
    pub force: bool,
}

// ---------------------------------------------------------------- repo

fn short_head(repo: &str) -> (String, bool) {
    match run(repo, &["symbolic-ref", "--short", "-q", "HEAD"]) {
        Ok(b) if !b.trim().is_empty() => (b.trim().to_string(), false),
        _ => match run(repo, &["rev-parse", "--short", "HEAD"]) {
            Ok(s) => (s.trim().to_string(), true),
            Err(_) => ("(no commits)".into(), false),
        },
    }
}

#[tauri::command]
pub async fn open_repo(path: String) -> Result<RepoInfo, String> {
    blocking(move || {
        let top = run(&path, &["rev-parse", "--show-toplevel"])
            .map_err(|_| format!("{path} is not a Git repository"))?;
        let top = top.trim().to_string();
        let name = std::path::Path::new(&top)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| top.clone());
        let (branch, detached) = short_head(&top);
        Ok(RepoInfo { path: top, name, branch, detached })
    })
    .await
}

#[tauri::command]
pub async fn init_repo(path: String) -> Result<RepoInfo, String> {
    blocking(move || {
        std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
        run(&path, &["init"])?;
        let name = std::path::Path::new(&path)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let (branch, detached) = short_head(&path);
        Ok(RepoInfo { path, name, branch, detached })
    })
    .await
}

#[tauri::command]
pub async fn clone_repo(url: String, dest: String) -> Result<String, String> {
    blocking(move || {
        ensure_not_flag(&url)?;
        let mut pre = Vec::new();
        if let Some(p) = accounts::auth_config_for_url(&url) {
            pre.push("-c".to_string());
            pre.push(format!("{}={}", p.0, p.1));
        }
        let parent = std::path::Path::new(&dest)
            .parent()
            .ok_or("Invalid destination")?
            .to_string_lossy()
            .into_owned();
        std::fs::create_dir_all(&parent).map_err(|e| e.to_string())?;
        run_all(&parent, &pre, &["clone", "--progress", "--", &url, &dest])?;
        Ok(dest)
    })
    .await
}

#[tauri::command]
pub async fn repo_summary(path: String) -> Result<Summary, String> {
    blocking(move || {
        let (branch, detached) = short_head(&path);
        let pending = status_entries(&path)?.len();
        let (mut ahead, mut behind, mut has_upstream) = (0, 0, false);
        if let Ok(s) = run(&path, &["rev-list", "--left-right", "--count", "@{u}...HEAD"]) {
            let mut it = s.split_whitespace();
            behind = it.next().and_then(|x| x.parse().ok()).unwrap_or(0);
            ahead = it.next().and_then(|x| x.parse().ok()).unwrap_or(0);
            has_upstream = true;
        }
        let has_remote = !run(&path, &["remote"]).unwrap_or_default().trim().is_empty();
        let gd = run(&path, &["rev-parse", "--git-dir"]).unwrap_or_default();
        let gd = std::path::Path::new(&path).join(gd.trim());
        Ok(Summary {
            branch,
            detached,
            pending,
            ahead,
            behind,
            has_upstream,
            has_remote,
            merging: gd.join("MERGE_HEAD").exists(),
            rebasing: gd.join("rebase-merge").exists() || gd.join("rebase-apply").exists(),
        })
    })
    .await
}

// ---------------------------------------------------------------- status

fn status_entries(repo: &str) -> Result<Vec<FileEntry>, String> {
    let out = run(repo, &["status", "--porcelain=v1", "-z", "--untracked-files=all"])?;
    let mut parts = out.split('\0').filter(|s| !s.is_empty());
    let mut v = Vec::new();
    while let Some(e) = parts.next() {
        if e.len() < 4 {
            continue;
        }
        let x = e.as_bytes()[0] as char;
        let y = e.as_bytes()[1] as char;
        let path = e[3..].to_string();
        let orig = if x == 'R' || x == 'C' {
            parts.next().map(|s| s.to_string())
        } else {
            None
        };
        let conflicted = matches!(
            (x, y),
            ('U', _) | (_, 'U') | ('A', 'A') | ('D', 'D')
        );
        v.push(FileEntry {
            path,
            orig,
            index: x.to_string(),
            worktree: y.to_string(),
            conflicted,
        });
    }
    Ok(v)
}

#[tauri::command]
pub async fn status(path: String) -> Result<Vec<FileEntry>, String> {
    blocking(move || status_entries(&path)).await
}

// ---------------------------------------------------------------- refs

fn parse_track(t: &str) -> (u32, u32) {
    let (mut a, mut b) = (0, 0);
    for part in t.split(',') {
        let p = part.trim();
        if let Some(n) = p.strip_prefix("ahead ") {
            a = n.parse().unwrap_or(0);
        } else if let Some(n) = p.strip_prefix("behind ") {
            b = n.parse().unwrap_or(0);
        }
    }
    (a, b)
}

#[tauri::command]
pub async fn refs(path: String) -> Result<Refs, String> {
    blocking(move || {
        let fmt = "--format=%(refname)%1f%(refname:short)%1f%(upstream:short)%1f%(upstream:track,nobracket)%1f%(HEAD)%1f%(objectname)";
        let out = run(&path, &["for-each-ref", fmt, "refs/heads", "refs/remotes", "refs/tags"])?;
        let (mut local, mut remote, mut tags) = (vec![], vec![], vec![]);
        for line in out.lines() {
            let f: Vec<&str> = line.split('\u{1f}').collect();
            if f.len() < 6 {
                continue;
            }
            let (ahead, behind) = parse_track(f[3]);
            let b = Branch {
                name: f[1].to_string(),
                full: f[0].to_string(),
                upstream: f[2].to_string(),
                ahead,
                behind,
                current: f[4] == "*",
                sha: f[5].to_string(),
            };
            if f[0].starts_with("refs/heads/") {
                local.push(b);
            } else if f[0].starts_with("refs/remotes/") {
                if !f[0].ends_with("/HEAD") {
                    remote.push(b);
                }
            } else {
                tags.push(b);
            }
        }
        let stashes = run(&path, &["stash", "list", "--format=%gd%x1f%s%x1f%H"])
            .unwrap_or_default()
            .lines()
            .filter_map(|l| {
                let f: Vec<&str> = l.split('\u{1f}').collect();
                (f.len() == 3).then(|| Stash {
                    name: f[0].into(),
                    message: f[1].into(),
                    sha: f[2].into(),
                })
            })
            .collect();
        let mut remotes: Vec<Remote> = vec![];
        for l in run(&path, &["remote", "-v"]).unwrap_or_default().lines() {
            let mut it = l.split_whitespace();
            if let (Some(n), Some(u)) = (it.next(), it.next()) {
                if !remotes.iter().any(|r| r.name == n) {
                    remotes.push(Remote { name: n.into(), url: u.into() });
                }
            }
        }
        let submodules = run(&path, &["submodule", "status"])
            .unwrap_or_default()
            .lines()
            .filter_map(|l| l.trim_start_matches([' ', '-', '+', 'U']).split_whitespace().nth(1))
            .map(String::from)
            .collect();
        Ok(Refs { local, remote, tags, stashes, remotes, submodules })
    })
    .await
}

// ---------------------------------------------------------------- history

#[tauri::command]
pub async fn log(path: String, opts: LogOpts) -> Result<Vec<Commit>, String> {
    blocking(move || {
        if !has_head(&path) {
            return Ok(vec![]);
        }
        let fmt = "--format=%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%D%x1f%s%x1e";
        let limit = opts.limit.clamp(1, 5000).to_string();
        let skip = opts.skip.to_string();
        let mut args: Vec<String> = vec![
            "log".into(),
            fmt.into(),
            if opts.topo { "--topo-order".into() } else { "--date-order".into() },
            "-n".into(),
            limit,
            "--skip".into(),
            skip,
        ];
        let q = opts.query.clone().unwrap_or_default();
        let mut pathspec: Option<String> = None;
        match opts.search_kind.as_deref() {
            Some("message") if !q.is_empty() => {
                args.push("-i".into());
                args.push(format!("--grep={q}"));
            }
            Some("author") if !q.is_empty() => {
                args.push("-i".into());
                args.push(format!("--author={q}"));
            }
            Some("content") if !q.is_empty() => args.push(format!("-S{q}")),
            Some("file") if !q.is_empty() => pathspec = Some(q.clone()),
            _ => {}
        }
        if !opts.branches.is_empty() {
            for b in &opts.branches {
                ensure_not_flag(b)?;
                args.push(b.clone());
            }
        } else if opts.all {
            args.push("--all".into());
        } else {
            args.push("--branches".into());
        }
        if let Some(p) = pathspec {
            args.push("--".into());
            args.push(p);
        }
        let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        let out = run(&path, &refs)?;
        Ok(out
            .split('\u{1e}')
            .filter_map(|rec| {
                let rec = rec.trim_start_matches('\n');
                let f: Vec<&str> = rec.split('\u{1f}').collect();
                if f.len() < 7 {
                    return None;
                }
                Some(Commit {
                    sha: f[0].into(),
                    parents: f[1].split_whitespace().map(String::from).collect(),
                    author: f[2].into(),
                    email: f[3].into(),
                    date: f[4].parse().unwrap_or(0),
                    refs: f[5]
                        .split(", ")
                        .filter(|s| !s.is_empty())
                        .map(String::from)
                        .collect(),
                    subject: f[6].into(),
                })
            })
            .collect())
    })
    .await
}

#[tauri::command]
pub async fn commit_details(path: String, sha: String) -> Result<CommitDetails, String> {
    blocking(move || {
        ensure_not_flag(&sha)?;
        let out = run(
            &path,
            &["show", "-s", "--format=%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%cn%x1f%ce%x1f%ct%x1f%B", &sha],
        )?;
        let f: Vec<&str> = out.splitn(9, '\u{1f}').collect();
        if f.len() < 9 {
            return Err("Could not read commit".into());
        }
        Ok(CommitDetails {
            sha: f[0].into(),
            parents: f[1].split_whitespace().map(String::from).collect(),
            author: f[2].into(),
            email: f[3].into(),
            date: f[4].parse().unwrap_or(0),
            committer: f[5].into(),
            committer_email: f[6].into(),
            committer_date: f[7].parse().unwrap_or(0),
            message: f[8].trim().to_string(),
        })
    })
    .await
}

fn first_parent(repo: &str, sha: &str) -> Option<String> {
    run(repo, &["rev-list", "--parents", "-n", "1", sha])
        .ok()
        .and_then(|s| s.split_whitespace().nth(1).map(String::from))
}

#[tauri::command]
pub async fn commit_files(path: String, sha: String) -> Result<Vec<ChangedFile>, String> {
    blocking(move || {
        ensure_not_flag(&sha)?;
        let out = match first_parent(&path, &sha) {
            Some(p) => run(&path, &["diff", "--name-status", "-M", "-z", &p, &sha])?,
            None => run(
                &path,
                &["diff-tree", "--root", "--no-commit-id", "-r", "-M", "--name-status", "-z", &sha],
            )?,
        };
        let mut it = out.split('\0').filter(|s| !s.is_empty());
        let mut v = vec![];
        while let Some(st) = it.next() {
            let first = st.chars().next().unwrap_or('M');
            if first == 'R' || first == 'C' {
                let old = it.next().unwrap_or("").to_string();
                let new = it.next().unwrap_or("").to_string();
                v.push(ChangedFile { status: first.to_string(), path: new, orig: Some(old) });
            } else if let Some(p) = it.next() {
                v.push(ChangedFile { status: first.to_string(), path: p.to_string(), orig: None });
            }
        }
        Ok(v)
    })
    .await
}

fn cap(mut s: String) -> String {
    if s.len() > MAX_DIFF_BYTES {
        let mut cut = MAX_DIFF_BYTES;
        while !s.is_char_boundary(cut) {
            cut -= 1;
        }
        s.truncate(cut);
        s.push_str("\n\\ Diff truncated (too large)\n");
    }
    s
}

#[tauri::command]
pub async fn commit_diff(path: String, sha: String, file: String) -> Result<String, String> {
    blocking(move || {
        ensure_not_flag(&sha)?;
        let out = match first_parent(&path, &sha) {
            Some(p) => run(&path, &["diff", "--no-color", "-M", &p, &sha, "--", &file])?,
            None => run(&path, &["show", "--format=", "--no-color", &sha, "--", &file])?,
        };
        Ok(cap(out))
    })
    .await
}

#[tauri::command]
pub async fn working_diff(
    path: String,
    file: String,
    staged: bool,
    untracked: bool,
) -> Result<String, String> {
    blocking(move || {
        if untracked {
            let mut c = base(Some(&path), &[]);
            c.args(["diff", "--no-index", "--no-color", "--", "/dev/null", &file]);
            let o = exec(c)?;
            if o.code == 0 || o.code == 1 {
                return Ok(cap(o.stdout));
            }
            return Err(fail(&o));
        }
        let mut args = vec!["diff", "--no-color"];
        if staged {
            args.push("--cached");
        }
        args.push("--");
        args.push(&file);
        Ok(cap(run(&path, &args)?))
    })
    .await
}

#[tauri::command]
pub async fn recent_messages(path: String) -> Result<Vec<String>, String> {
    blocking(move || {
        if !has_head(&path) {
            return Ok(vec![]);
        }
        let out = run(&path, &["log", "-n", "20", "--format=%B%x1e"])?;
        Ok(out
            .split('\u{1e}')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect())
    })
    .await
}

// ---------------------------------------------------------------- staging

#[tauri::command]
pub async fn stage(path: String, files: Vec<String>) -> Result<(), String> {
    blocking(move || {
        if files.is_empty() {
            return Ok(());
        }
        let mut a = vec!["add", "-A", "--"];
        a.extend(files.iter().map(|s| s.as_str()));
        run(&path, &a).map(|_| ())
    })
    .await
}

#[tauri::command]
pub async fn unstage(path: String, files: Vec<String>) -> Result<(), String> {
    blocking(move || {
        if files.is_empty() {
            return Ok(());
        }
        let head = has_head(&path);
        let mut a = if head {
            vec!["restore", "--staged", "--"]
        } else {
            vec!["rm", "--cached", "-r", "-q", "--"]
        };
        a.extend(files.iter().map(|s| s.as_str()));
        run(&path, &a).map(|_| ())
    })
    .await
}

#[tauri::command]
pub async fn discard(path: String, files: Vec<String>) -> Result<(), String> {
    blocking(move || {
        let entries = status_entries(&path)?;
        let head = has_head(&path);
        for f in &files {
            let Some(e) = entries.iter().find(|e| &e.path == f) else { continue };
            if e.worktree == "?" {
                run(&path, &["clean", "-f", "-d", "--", f])?;
            } else if e.index == "A" || !head {
                run(&path, &["rm", "-f", "-q", "--", f])?;
            } else {
                run(&path, &["restore", "--source=HEAD", "--staged", "--worktree", "--", f])?;
            }
        }
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn apply_patch(
    path: String,
    patch: String,
    cached: bool,
    reverse: bool,
) -> Result<(), String> {
    blocking(move || {
        let mut a = vec!["apply", "--recount", "--whitespace=nowarn"];
        if cached {
            a.push("--cached");
        }
        if reverse {
            a.push("-R");
        }
        a.push("-");
        run_stdin(&path, &a, &patch).map(|_| ())
    })
    .await
}

#[tauri::command]
pub async fn commit(path: String, opts: CommitOpts) -> Result<String, String> {
    blocking(move || {
        let mut a: Vec<String> = vec!["commit".into()];
        if opts.amend {
            a.push("--amend".into());
        }
        if opts.message.trim().is_empty() {
            if opts.amend {
                a.push("--no-edit".into());
            } else {
                return Err("Enter a commit message".into());
            }
        } else {
            a.push("-m".into());
            a.push(opts.message.clone());
        }
        if opts.no_verify {
            a.push("--no-verify".into());
        }
        if opts.signoff {
            a.push("--signoff".into());
        }
        if let Some(au) = opts.author.filter(|s| !s.trim().is_empty()) {
            ensure_not_flag(&au)?;
            a.push(format!("--author={au}"));
        }
        let r: Vec<&str> = a.iter().map(|s| s.as_str()).collect();
        run_all(&path, &[], &r)
    })
    .await
}

// ---------------------------------------------------------------- network

#[tauri::command]
pub async fn fetch(path: String) -> Result<String, String> {
    blocking(move || run_all(&path, &net_pre(&path), &["fetch", "--all", "--prune"])).await
}

#[tauri::command]
pub async fn pull(path: String, remote: Option<String>, branch: Option<String>, rebase: bool) -> Result<String, String> {
    blocking(move || {
        let mut a = vec!["pull"];
        a.push(if rebase { "--rebase" } else { "--no-rebase" });
        if let (Some(r), Some(b)) = (&remote, &branch) {
            ensure_not_flag(r)?;
            ensure_not_flag(b)?;
            a.push(r);
            a.push(b);
        }
        run_all(&path, &net_pre(&path), &a)
    })
    .await
}

#[tauri::command]
pub async fn push(path: String, opts: PushOpts) -> Result<String, String> {
    blocking(move || {
        ensure_not_flag(&opts.remote)?;
        ensure_not_flag(&opts.branch)?;
        let mut a: Vec<String> = vec!["push".into()];
        if opts.set_upstream {
            a.push("--set-upstream".into());
        }
        if opts.force {
            a.push("--force-with-lease".into());
        }
        a.push(opts.remote.clone());
        let target = opts.remote_branch.clone().unwrap_or_else(|| opts.branch.clone());
        ensure_not_flag(&target)?;
        a.push(format!("{}:refs/heads/{}", opts.branch, target));
        if opts.tags {
            a.push("--tags".into());
        }
        let r: Vec<&str> = a.iter().map(|s| s.as_str()).collect();
        run_all(&path, &net_pre(&path), &r)
    })
    .await
}

// ---------------------------------------------------------------- branches, merge, tags

#[tauri::command]
pub async fn checkout(path: String, target: String, track_remote: bool) -> Result<String, String> {
    blocking(move || {
        ensure_not_flag(&target)?;
        if track_remote {
            // origin/foo -> create local foo tracking it
            let local = target.splitn(2, '/').nth(1).unwrap_or(&target).to_string();
            let exists = run(&path, &["rev-parse", "--verify", "-q", &format!("refs/heads/{local}")]).is_ok();
            if exists {
                return run_all(&path, &[], &["checkout", &local]);
            }
            return run_all(&path, &[], &["checkout", "-b", &local, "--track", &target]);
        }
        run_all(&path, &[], &["checkout", &target])
    })
    .await
}

#[tauri::command]
pub async fn create_branch(path: String, name: String, start: Option<String>, checkout: bool) -> Result<String, String> {
    blocking(move || {
        ensure_not_flag(&name)?;
        let mut a = vec![if checkout { "checkout" } else { "branch" }];
        if checkout {
            a.push("-b");
        }
        a.push(&name);
        if let Some(s) = &start {
            ensure_not_flag(s)?;
            a.push(s);
        }
        run_all(&path, &[], &a)
    })
    .await
}

#[tauri::command]
pub async fn delete_branch(path: String, name: String, force: bool, remote: Option<String>) -> Result<String, String> {
    blocking(move || {
        ensure_not_flag(&name)?;
        if let Some(r) = remote {
            ensure_not_flag(&r)?;
            return run_all(&path, &net_pre(&path), &["push", &r, "--delete", &name]);
        }
        run_all(&path, &[], &["branch", if force { "-D" } else { "-d" }, &name])
    })
    .await
}

#[tauri::command]
pub async fn merge(path: String, target: String, no_ff: bool) -> Result<String, String> {
    blocking(move || {
        ensure_not_flag(&target)?;
        let mut a = vec!["merge", "--no-edit"];
        if no_ff {
            a.push("--no-ff");
        }
        a.push(&target);
        run_all(&path, &[], &a)
    })
    .await
}

#[tauri::command]
pub async fn abort_operation(path: String) -> Result<String, String> {
    blocking(move || {
        let gd = run(&path, &["rev-parse", "--git-dir"])?;
        let gd = std::path::Path::new(&path).join(gd.trim());
        if gd.join("MERGE_HEAD").exists() {
            run_all(&path, &[], &["merge", "--abort"])
        } else if gd.join("rebase-merge").exists() || gd.join("rebase-apply").exists() {
            run_all(&path, &[], &["rebase", "--abort"])
        } else if gd.join("CHERRY_PICK_HEAD").exists() {
            run_all(&path, &[], &["cherry-pick", "--abort"])
        } else {
            Err("Nothing to abort".into())
        }
    })
    .await
}

#[tauri::command]
pub async fn rebase(path: String, onto: String) -> Result<String, String> {
    blocking(move || {
        ensure_not_flag(&onto)?;
        run_all(&path, &[], &["rebase", &onto])
    })
    .await
}

#[tauri::command]
pub async fn cherry_pick(path: String, sha: String) -> Result<String, String> {
    blocking(move || {
        ensure_not_flag(&sha)?;
        run_all(&path, &[], &["cherry-pick", &sha])
    })
    .await
}

#[tauri::command]
pub async fn revert_commit(path: String, sha: String) -> Result<String, String> {
    blocking(move || {
        ensure_not_flag(&sha)?;
        run_all(&path, &[], &["revert", "--no-edit", &sha])
    })
    .await
}

#[tauri::command]
pub async fn reset(path: String, target: String, mode: String) -> Result<String, String> {
    blocking(move || {
        ensure_not_flag(&target)?;
        let flag = match mode.as_str() {
            "soft" => "--soft",
            "mixed" => "--mixed",
            "hard" => "--hard",
            _ => return Err("Invalid reset mode".into()),
        };
        run_all(&path, &[], &["reset", flag, &target])
    })
    .await
}

#[tauri::command]
pub async fn tag_create(path: String, name: String, sha: Option<String>, message: Option<String>) -> Result<String, String> {
    blocking(move || {
        ensure_not_flag(&name)?;
        let mut a: Vec<String> = vec!["tag".into()];
        if let Some(m) = message.filter(|m| !m.trim().is_empty()) {
            a.push("-a".into());
            a.push("-m".into());
            a.push(m);
        }
        a.push(name);
        if let Some(s) = sha {
            ensure_not_flag(&s)?;
            a.push(s);
        }
        let r: Vec<&str> = a.iter().map(|s| s.as_str()).collect();
        run_all(&path, &[], &r)
    })
    .await
}

#[tauri::command]
pub async fn tag_delete(path: String, name: String, remote: Option<String>) -> Result<String, String> {
    blocking(move || {
        ensure_not_flag(&name)?;
        if let Some(r) = remote {
            ensure_not_flag(&r)?;
            return run_all(&path, &net_pre(&path), &["push", &r, "--delete", &format!("refs/tags/{name}")]);
        }
        run_all(&path, &[], &["tag", "-d", &name])
    })
    .await
}

#[tauri::command]
pub async fn remote_add(path: String, name: String, url: String) -> Result<(), String> {
    blocking(move || {
        ensure_not_flag(&name)?;
        ensure_not_flag(&url)?;
        run(&path, &["remote", "add", &name, &url]).map(|_| ())
    })
    .await
}

#[tauri::command]
pub async fn remote_remove(path: String, name: String) -> Result<(), String> {
    blocking(move || {
        ensure_not_flag(&name)?;
        run(&path, &["remote", "remove", &name]).map(|_| ())
    })
    .await
}

// ---------------------------------------------------------------- stash

#[tauri::command]
pub async fn stash_save(path: String, message: String, include_untracked: bool) -> Result<String, String> {
    blocking(move || {
        let mut a = vec!["stash", "push"];
        if include_untracked {
            a.push("-u");
        }
        if !message.trim().is_empty() {
            a.push("-m");
            a.push(&message);
        }
        run_all(&path, &[], &a)
    })
    .await
}

#[tauri::command]
pub async fn stash_action(path: String, name: String, action: String) -> Result<String, String> {
    blocking(move || {
        if !name.starts_with("stash@{") {
            return Err("Invalid stash".into());
        }
        let verb = match action.as_str() {
            "apply" => "apply",
            "pop" => "pop",
            "drop" => "drop",
            _ => return Err("Invalid action".into()),
        };
        run_all(&path, &[], &["stash", verb, &name])
    })
    .await
}

// ---------------------------------------------------------------- git flow

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowConfig {
    pub master: String,
    pub develop: String,
    pub feature: String,
    pub release: String,
    pub hotfix: String,
    pub version_tag: String,
}

fn flow_get(repo: &str, key: &str, default: &str) -> String {
    run(repo, &["config", "--get", key])
        .map(|s| s.trim().to_string())
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| default.to_string())
}

#[tauri::command]
pub async fn flow_config(path: String) -> Result<FlowConfigOut, String> {
    blocking(move || {
        let initialised = run(&path, &["config", "--get", "gitflow.branch.develop"]).is_ok();
        Ok(FlowConfigOut {
            initialised,
            master: flow_get(&path, "gitflow.branch.master", "master"),
            develop: flow_get(&path, "gitflow.branch.develop", "develop"),
            feature: flow_get(&path, "gitflow.prefix.feature", "feature/"),
            release: flow_get(&path, "gitflow.prefix.release", "release/"),
            hotfix: flow_get(&path, "gitflow.prefix.hotfix", "hotfix/"),
            version_tag: flow_get(&path, "gitflow.prefix.versiontag", ""),
        })
    })
    .await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowConfigOut {
    pub initialised: bool,
    pub master: String,
    pub develop: String,
    pub feature: String,
    pub release: String,
    pub hotfix: String,
    pub version_tag: String,
}

#[tauri::command]
pub async fn flow_init(path: String, cfg: FlowConfig) -> Result<(), String> {
    blocking(move || {
        for (k, v) in [
            ("gitflow.branch.master", &cfg.master),
            ("gitflow.branch.develop", &cfg.develop),
            ("gitflow.prefix.feature", &cfg.feature),
            ("gitflow.prefix.release", &cfg.release),
            ("gitflow.prefix.hotfix", &cfg.hotfix),
            ("gitflow.prefix.versiontag", &cfg.version_tag),
        ] {
            run(&path, &["config", k, v])?;
        }
        let exists = run(&path, &["rev-parse", "--verify", "-q", &format!("refs/heads/{}", cfg.develop)]).is_ok();
        if !exists && has_head(&path) {
            run(&path, &["branch", &cfg.develop])?;
        }
        Ok(())
    })
    .await
}

fn flow_prefix(repo: &str, kind: &str) -> Result<(String, String), String> {
    let master = flow_get(repo, "gitflow.branch.master", "master");
    let develop = flow_get(repo, "gitflow.branch.develop", "develop");
    match kind {
        "feature" => Ok((flow_get(repo, "gitflow.prefix.feature", "feature/"), develop)),
        "release" => Ok((flow_get(repo, "gitflow.prefix.release", "release/"), develop)),
        "hotfix" => Ok((flow_get(repo, "gitflow.prefix.hotfix", "hotfix/"), master)),
        _ => Err("Unknown flow type".into()),
    }
}

#[tauri::command]
pub async fn flow_start(path: String, kind: String, name: String) -> Result<String, String> {
    blocking(move || {
        ensure_not_flag(&name)?;
        let (prefix, base_branch) = flow_prefix(&path, &kind)?;
        run_all(&path, &[], &["checkout", "-b", &format!("{prefix}{name}"), &base_branch])
    })
    .await
}

#[tauri::command]
pub async fn flow_finish(path: String, kind: String, name: String, tag_message: Option<String>) -> Result<String, String> {
    blocking(move || {
        ensure_not_flag(&name)?;
        let (prefix, _) = flow_prefix(&path, &kind)?;
        let branch = format!("{prefix}{name}");
        let master = flow_get(&path, "gitflow.branch.master", "master");
        let develop = flow_get(&path, "gitflow.branch.develop", "develop");
        let mut log = String::new();
        let mut step = |args: &[&str]| -> Result<(), String> {
            let o = run_all(&path, &[], args)?;
            log.push_str(&o);
            log.push('\n');
            Ok(())
        };
        if kind == "feature" {
            step(&["checkout", &develop])?;
            step(&["merge", "--no-ff", "--no-edit", &branch])?;
        } else {
            let vt = flow_get(&path, "gitflow.prefix.versiontag", "");
            step(&["checkout", &master])?;
            step(&["merge", "--no-ff", "--no-edit", &branch])?;
            let msg = tag_message.unwrap_or_else(|| format!("{kind} {name}"));
            step(&["tag", "-a", "-m", &msg, &format!("{vt}{name}")])?;
            step(&["checkout", &develop])?;
            step(&["merge", "--no-ff", "--no-edit", &format!("{vt}{name}")])?;
        }
        step(&["branch", "-d", &branch])?;
        Ok(log.trim().to_string())
    })
    .await
}

// ---------------------------------------------------------------- misc

#[tauri::command]
pub async fn ignore_add(path: String, pattern: String) -> Result<(), String> {
    blocking(move || {
        if pattern.contains('\n') {
            return Err("Invalid pattern".into());
        }
        let p = std::path::Path::new(&path).join(".gitignore");
        let mut s = std::fs::read_to_string(&p).unwrap_or_default();
        if !s.is_empty() && !s.ends_with('\n') {
            s.push('\n');
        }
        s.push_str(&pattern);
        s.push('\n');
        std::fs::write(p, s).map_err(|e| e.to_string())
    })
    .await
}

#[derive(Serialize)]
pub struct Identity {
    pub name: String,
    pub email: String,
}

#[tauri::command]
pub async fn get_identity(path: Option<String>) -> Result<Identity, String> {
    blocking(move || {
        let get = |k: &str| -> String {
            let mut c = base(path.as_deref(), &[]);
            c.args(["config", "--get", k]);
            exec(c).map(|o| o.stdout.trim().to_string()).unwrap_or_default()
        };
        Ok(Identity { name: get("user.name"), email: get("user.email") })
    })
    .await
}

#[tauri::command]
pub async fn set_identity(name: String, email: String) -> Result<(), String> {
    blocking(move || {
        for (k, v) in [("user.name", &name), ("user.email", &email)] {
            let mut c = base(None, &[]);
            c.args(["config", "--global", k, v]);
            let o = exec(c)?;
            if o.code != 0 {
                return Err(fail(&o));
            }
        }
        Ok(())
    })
    .await
}

fn spawn_detached(mut c: Command) -> bool {
    c.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    c.spawn().is_ok()
}

#[tauri::command]
pub async fn open_terminal(path: String) -> Result<(), String> {
    blocking(move || {
        let tries: Vec<(&str, Vec<&str>)> = vec![
            ("x-terminal-emulator", vec![]),
            ("gnome-terminal", vec!["--working-directory", &path]),
            ("konsole", vec!["--workdir", &path]),
            ("xfce4-terminal", vec!["--working-directory", &path]),
            ("xterm", vec![]),
        ];
        for (bin, args) in tries {
            let mut c = Command::new(bin);
            c.args(args).current_dir(&path);
            if spawn_detached(c) {
                return Ok(());
            }
        }
        Err("No terminal emulator found".into())
    })
    .await
}

#[tauri::command]
pub async fn open_in_files(path: String) -> Result<(), String> {
    blocking(move || {
        let mut c = Command::new("xdg-open");
        c.arg(&path);
        if spawn_detached(c) {
            Ok(())
        } else {
            Err("xdg-open is not available".into())
        }
    })
    .await
}

#[tauri::command]
pub async fn git_version() -> Result<String, String> {
    blocking(|| {
        let mut c = base(None, &[]);
        c.arg("--version");
        let o = exec(c)?;
        if o.code == 0 {
            Ok(o.stdout.trim().to_string())
        } else {
            Err(fail(&o))
        }
    })
    .await
}

// ---------------------------------------------------------------- conflicts

/// A file path that is relative, stays inside the repo and is not a symlink.
fn safe_repo_file(repo: &str, file: &str) -> Result<std::path::PathBuf, String> {
    if file.is_empty() || file.starts_with('/') || file.split('/').any(|c| c == ".." || c == ".git") {
        return Err("Invalid file path".into());
    }
    let p = std::path::Path::new(repo).join(file);
    if let Ok(m) = std::fs::symlink_metadata(&p) {
        if m.file_type().is_symlink() {
            return Err("Refusing to edit a symbolic link".into());
        }
    }
    Ok(p)
}

#[tauri::command]
pub async fn read_conflict_file(path: String, file: String) -> Result<String, String> {
    blocking(move || {
        let p = safe_repo_file(&path, &file)?;
        let meta = std::fs::metadata(&p).map_err(|e| e.to_string())?;
        if meta.len() > MAX_DIFF_BYTES as u64 {
            return Err("File is too large to resolve here".into());
        }
        let bytes = std::fs::read(&p).map_err(|e| e.to_string())?;
        String::from_utf8(bytes).map_err(|_| "This file is not text. Choose mine or theirs for the whole file.".to_string())
    })
    .await
}

/// mode: "ours" | "theirs" take a whole side; "content" writes `content` (the merged text).
/// In every case the file is then staged, which marks the conflict as resolved.
#[tauri::command]
pub async fn resolve_conflict(
    path: String,
    file: String,
    mode: String,
    content: Option<String>,
) -> Result<(), String> {
    blocking(move || {
        let p = safe_repo_file(&path, &file)?;
        match mode.as_str() {
            "ours" | "theirs" => {
                let flag = if mode == "ours" { "--ours" } else { "--theirs" };
                if run(&path, &["checkout", flag, "--", &file]).is_err() {
                    // the chosen side deleted the file
                    run(&path, &["rm", "-f", "-q", "--", &file])?;
                    return Ok(());
                }
            }
            "content" => {
                let c = content.ok_or("Missing content")?;
                std::fs::write(&p, c).map_err(|e| e.to_string())?;
            }
            _ => return Err("Invalid resolve mode".into()),
        }
        run(&path, &["add", "--", &file]).map(|_| ())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::async_runtime::block_on;

    fn tmp(name: &str) -> String {
        let p = std::env::temp_dir().join(format!("stlinux-test-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p.to_string_lossy().into_owned()
    }

    fn setup(name: &str) -> String {
        let d = tmp(name);
        block_on(init_repo(d.clone())).unwrap();
        run(&d, &["config", "user.name", "Test User"]).unwrap();
        run(&d, &["config", "user.email", "test@example.com"]).unwrap();
        run(&d, &["config", "commit.gpgsign", "false"]).unwrap();
        run(&d, &["checkout", "-q", "-b", "main"]).ok();
        d
    }

    fn write(d: &str, f: &str, c: &str) {
        std::fs::write(std::path::Path::new(d).join(f), c).unwrap();
    }

    fn do_commit(d: &str, msg: &str) {
        block_on(commit(
            d.to_string(),
            CommitOpts { message: msg.into(), amend: false, no_verify: false, signoff: false, author: None },
        ))
        .unwrap();
    }

    #[test]
    fn status_stage_commit_log() {
        let d = setup("basic");
        write(&d, "a.txt", "one\n");
        let s = block_on(status(d.clone())).unwrap();
        assert_eq!(s.len(), 1);
        assert_eq!(s[0].worktree, "?");
        block_on(stage(d.clone(), vec!["a.txt".into()])).unwrap();
        let s = block_on(status(d.clone())).unwrap();
        assert_eq!(s[0].index, "A");
        do_commit(&d, "first");
        write(&d, "a.txt", "one\ntwo\n");
        let s = block_on(status(d.clone())).unwrap();
        assert_eq!((s[0].index.as_str(), s[0].worktree.as_str()), (" ", "M"));
        let diff = block_on(working_diff(d.clone(), "a.txt".into(), false, false)).unwrap();
        assert!(diff.contains("+two"));
        let l = block_on(log(d.clone(), LogOpts { limit: 10, skip: 0, all: true, branches: vec![], topo: false, search_kind: None, query: None })).unwrap();
        assert_eq!(l.len(), 1);
        assert_eq!(l[0].subject, "first");
        assert!(l[0].parents.is_empty());
        let files = block_on(commit_files(d.clone(), l[0].sha.clone())).unwrap();
        assert_eq!(files[0].status, "A");
        let cd = block_on(commit_diff(d.clone(), l[0].sha.clone(), "a.txt".into())).unwrap();
        assert!(cd.contains("+one"));
        block_on(unstage(d.clone(), vec!["a.txt".into()])).unwrap();
        block_on(discard(d.clone(), vec!["a.txt".into()])).unwrap();
        assert!(block_on(status(d.clone())).unwrap().is_empty());
    }

    #[test]
    fn empty_repo_is_safe() {
        let d = setup("empty");
        let l = block_on(log(d.clone(), LogOpts { limit: 10, skip: 0, all: true, branches: vec![], topo: false, search_kind: None, query: None })).unwrap();
        assert!(l.is_empty());
        let sm = block_on(repo_summary(d.clone())).unwrap();
        assert_eq!(sm.pending, 0);
        write(&d, "x", "1\n");
        block_on(stage(d.clone(), vec!["x".into()])).unwrap();
        block_on(unstage(d.clone(), vec!["x".into()])).unwrap();
        assert_eq!(block_on(status(d.clone())).unwrap()[0].worktree, "?");
        assert!(block_on(recent_messages(d.clone())).unwrap().is_empty());
    }

    #[test]
    fn hunk_patch_stage_and_unstage() {
        let d = setup("hunk");
        let base: String = (1..=20).map(|i| format!("line{i}\n")).collect();
        write(&d, "f.txt", &base);
        block_on(stage(d.clone(), vec!["f.txt".into()])).unwrap();
        do_commit(&d, "base");
        let edited = base.replace("line2\n", "LINE2\n").replace("line19\n", "LINE19\n");
        write(&d, "f.txt", &edited);
        let diff = block_on(working_diff(d.clone(), "f.txt".into(), false, false)).unwrap();
        // take only the first hunk
        let first_at = diff.find("@@").unwrap();
        let second_at = diff[first_at + 2..].find("\n@@").map(|i| first_at + 2 + i + 1).unwrap();
        let patch = format!("{}{}\n", &diff[..first_at], &diff[first_at..second_at].trim_end());
        block_on(apply_patch(d.clone(), patch.clone(), true, false)).unwrap();
        let staged = block_on(working_diff(d.clone(), "f.txt".into(), true, false)).unwrap();
        assert!(staged.contains("+LINE2") && !staged.contains("LINE19"));
        let unstaged = block_on(working_diff(d.clone(), "f.txt".into(), false, false)).unwrap();
        assert!(unstaged.contains("+LINE19") && !unstaged.contains("+LINE2\n"));
        // reverse (unstage) the same hunk
        block_on(apply_patch(d.clone(), patch, true, true)).unwrap();
        let staged = block_on(working_diff(d.clone(), "f.txt".into(), true, false)).unwrap();
        assert!(staged.is_empty());
    }

    #[test]
    fn branches_merge_stash_tags_refs() {
        let d = setup("branches");
        write(&d, "a", "1\n");
        block_on(stage(d.clone(), vec!["a".into()])).unwrap();
        do_commit(&d, "init");
        block_on(create_branch(d.clone(), "feat".into(), None, true)).unwrap();
        write(&d, "b", "2\n");
        block_on(stage(d.clone(), vec!["b".into()])).unwrap();
        do_commit(&d, "on feat");
        block_on(checkout(d.clone(), "main".into(), false)).unwrap();
        block_on(merge(d.clone(), "feat".into(), true)).unwrap();
        block_on(tag_create(d.clone(), "v1".into(), None, Some("release".into()))).unwrap();
        write(&d, "c", "3\n");
        block_on(stash_save(d.clone(), "wip".into(), true)).unwrap();
        let r = block_on(refs(d.clone())).unwrap();
        assert_eq!(r.local.len(), 2);
        assert!(r.local.iter().any(|b| b.current && b.name == "main"));
        assert_eq!(r.tags[0].name, "v1");
        assert_eq!(r.stashes.len(), 1);
        assert!(r.stashes[0].message.contains("wip"));
        block_on(stash_action(d.clone(), "stash@{0}".into(), "pop".into())).unwrap();
        assert_eq!(block_on(status(d.clone())).unwrap().len(), 1);
        let l = block_on(log(d.clone(), LogOpts { limit: 10, skip: 0, all: true, branches: vec![], topo: true, search_kind: Some("message".into()), query: Some("feat".into()) })).unwrap();
        // matches "on feat" and the "Merge branch 'feat'" commit
        assert_eq!(l.len(), 2);
        let all = block_on(log(d.clone(), LogOpts { limit: 10, skip: 0, all: true, branches: vec![], topo: false, search_kind: None, query: None })).unwrap();
        assert_eq!(all.len(), 3);
        assert!(all[0].parents.len() == 2, "merge commit has two parents");
        block_on(delete_branch(d.clone(), "feat".into(), false, None)).unwrap();
    }

    #[test]
    fn merge_conflict_and_abort() {
        let d = setup("conflict");
        write(&d, "a", "base\n");
        block_on(stage(d.clone(), vec!["a".into()])).unwrap();
        do_commit(&d, "base");
        block_on(create_branch(d.clone(), "other".into(), None, true)).unwrap();
        write(&d, "a", "other\n");
        block_on(stage(d.clone(), vec!["a".into()])).unwrap();
        do_commit(&d, "other change");
        block_on(checkout(d.clone(), "main".into(), false)).unwrap();
        write(&d, "a", "main\n");
        block_on(stage(d.clone(), vec!["a".into()])).unwrap();
        do_commit(&d, "main change");
        let err = block_on(merge(d.clone(), "other".into(), false)).unwrap_err();
        assert!(err.to_lowercase().contains("conflict"), "{err}");
        let sm = block_on(repo_summary(d.clone())).unwrap();
        assert!(sm.merging);
        let s = block_on(status(d.clone())).unwrap();
        assert!(s[0].conflicted);
        block_on(abort_operation(d.clone())).unwrap();
        assert!(!block_on(repo_summary(d.clone())).unwrap().merging);
    }

    #[test]
    fn resolve_conflict_sides_and_content() {
        let make = |name: &str| {
            let d = setup(name);
            write(&d, "a", "base\n");
            block_on(stage(d.clone(), vec!["a".into()])).unwrap();
            do_commit(&d, "base");
            block_on(create_branch(d.clone(), "other".into(), None, true)).unwrap();
            write(&d, "a", "theirs-text\n");
            block_on(stage(d.clone(), vec!["a".into()])).unwrap();
            do_commit(&d, "other");
            block_on(checkout(d.clone(), "main".into(), false)).unwrap();
            write(&d, "a", "ours-text\n");
            block_on(stage(d.clone(), vec!["a".into()])).unwrap();
            do_commit(&d, "main");
            let _ = block_on(merge(d.clone(), "other".into(), false));
            d
        };
        let d = make("res-ours");
        let txt = block_on(read_conflict_file(d.clone(), "a".into())).unwrap();
        assert!(txt.contains("<<<<<<<") && txt.contains(">>>>>>>"));
        block_on(resolve_conflict(d.clone(), "a".into(), "ours".into(), None)).unwrap();
        assert_eq!(std::fs::read_to_string(std::path::Path::new(&d).join("a")).unwrap(), "ours-text\n");
        assert!(!block_on(status(d.clone())).unwrap().iter().any(|f| f.conflicted));
        let d = make("res-theirs");
        block_on(resolve_conflict(d.clone(), "a".into(), "theirs".into(), None)).unwrap();
        assert_eq!(std::fs::read_to_string(std::path::Path::new(&d).join("a")).unwrap(), "theirs-text\n");
        let d = make("res-content");
        block_on(resolve_conflict(d.clone(), "a".into(), "content".into(), Some("merged\n".into()))).unwrap();
        assert_eq!(std::fs::read_to_string(std::path::Path::new(&d).join("a")).unwrap(), "merged\n");
        // finish the merge
        do_commit(&d, "merge done");
        assert!(!block_on(repo_summary(d)).unwrap().merging);
    }

    #[test]
    fn conflict_paths_are_confined() {
        let d = setup("confine");
        assert!(block_on(read_conflict_file(d.clone(), "../etc/passwd".into())).is_err());
        assert!(block_on(read_conflict_file(d.clone(), "/etc/passwd".into())).is_err());
        assert!(block_on(resolve_conflict(d.clone(), ".git/config".into(), "content".into(), Some("x".into()))).is_err());
        write(&d, "real", "x\n");
        std::os::unix::fs::symlink("/etc/hostname", std::path::Path::new(&d).join("link")).unwrap();
        assert!(block_on(resolve_conflict(d, "link".into(), "content".into(), Some("x".into()))).is_err());
    }

    #[test]
    fn flow_feature() {
        let d = setup("flow");
        write(&d, "a", "1\n");
        block_on(stage(d.clone(), vec!["a".into()])).unwrap();
        do_commit(&d, "init");
        block_on(flow_init(d.clone(), FlowConfig { master: "main".into(), develop: "develop".into(), feature: "feature/".into(), release: "release/".into(), hotfix: "hotfix/".into(), version_tag: "v".into() })).unwrap();
        assert!(block_on(flow_config(d.clone())).unwrap().initialised);
        block_on(flow_start(d.clone(), "feature".into(), "x".into())).unwrap();
        write(&d, "f", "x\n");
        block_on(stage(d.clone(), vec!["f".into()])).unwrap();
        do_commit(&d, "feature work");
        block_on(flow_finish(d.clone(), "feature".into(), "x".into(), None)).unwrap();
        let r = block_on(refs(d.clone())).unwrap();
        assert!(r.local.iter().any(|b| b.current && b.name == "develop"));
        assert!(!r.local.iter().any(|b| b.name == "feature/x"));
    }

    #[test]
    fn rejects_flag_injection() {
        let d = setup("inject");
        assert!(block_on(checkout(d.clone(), "--orphan=x".into(), false)).is_err());
        assert!(block_on(clone_repo("--upload-pack=touch /tmp/pwned".into(), "/tmp/x".into())).is_err());
        assert!(block_on(merge(d, "-s".into(), false)).is_err());
    }
}
