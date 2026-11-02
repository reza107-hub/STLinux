import {
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  CloudDownload,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  Globe,
  type LucideIcon,
  Settings,
  SquareTerminal,
  Tag,
  Undo2,
  Workflow,
} from 'lucide-react'
import { Fragment } from 'react'
import { useActions } from '../lib/actions'
import { useRepo } from '../lib/repo'

type Item = { id: string; label: string; icon: LucideIcon; badge?: number; tip: string; run: () => void }

export default function Toolbar() {
  const a = useActions()
  const { summary } = useRepo()
  const pending = summary?.pending ?? 0
  const behind = summary?.behind ?? 0
  const ahead = summary?.ahead ?? 0

  // Order and grouping follow the original toolbar (a separator between groups).
  const groups: Item[][] = [
    [{ id: 'commit', label: 'Commit', icon: GitCommitHorizontal, badge: pending, tip: `Commit (Ctrl+1) - ${pending} pending files`, run: () => a.view('status') }],
    [
      { id: 'pull', label: 'Pull', icon: ArrowDownToLine, badge: behind, tip: `Pull (Ctrl+Shift+L) - ${behind} incoming`, run: a.pull },
      { id: 'push', label: 'Push', icon: ArrowUpFromLine, badge: ahead, tip: `Push (Ctrl+Shift+P) - ${ahead} outgoing`, run: a.push },
      { id: 'fetch', label: 'Fetch', icon: CloudDownload, tip: 'Fetch all remotes (Ctrl+Shift+F)', run: a.fetch },
    ],
    [
      { id: 'branch', label: 'Branch', icon: GitBranch, tip: 'Create or manage branches', run: a.branch },
      { id: 'merge', label: 'Merge', icon: GitMerge, tip: 'Merge a branch into the current one', run: a.merge },
    ],
    [{ id: 'stash', label: 'Stash', icon: Archive, tip: 'Stash changes (Ctrl+Shift+S)', run: a.stash }],
    [
      { id: 'discard', label: 'Discard', icon: Undo2, tip: 'Discard all changes', run: a.discardAll },
      { id: 'tag', label: 'Tag', icon: Tag, tip: 'Create a tag', run: a.tag },
      { id: 'flow', label: 'Git Flow', icon: Workflow, tip: 'Git Flow', run: a.flow },
      { id: 'remote', label: 'Remote', icon: Globe, tip: 'Remotes', run: a.repoSettings },
      { id: 'terminal', label: 'Terminal', icon: SquareTerminal, tip: 'Open a terminal here', run: a.terminal },
      { id: 'files', label: 'Files', icon: FolderOpen, tip: 'Open in file manager', run: a.files },
      { id: 'settings', label: 'Settings', icon: Settings, tip: 'Repository settings (Ctrl+Shift+,)', run: a.repoSettings },
    ],
  ]

  return (
    <div className="flex shrink-0 items-stretch overflow-x-auto border-b border-border bg-surface px-1 py-1">
      {groups.map((group, gi) => (
        <Fragment key={gi}>
          {gi > 0 && <div className="mx-3 my-1 w-px shrink-0 bg-border" />}
          {group.map(({ id, label, icon: Icon, badge, tip, run }) => (
            <button
              key={id}
              type="button"
              title={tip}
              onClick={run}
              className="relative flex min-w-12 shrink-0 flex-col items-center justify-center rounded px-1 py-0.5 hover:bg-hover hover:text-foreground-strong"
            >
              <Icon size={28} strokeWidth={1.5} />
              <span className="mx-[3px]">{label}</span>
              {badge ? (
                <span className="absolute right-0 top-0 min-w-5 rounded-[5px] border border-primary bg-primary px-[3px] text-center text-[10px] font-semibold leading-4 text-primary-foreground">
                  {badge}
                </span>
              ) : null}
            </button>
          ))}
        </Fragment>
      ))}
    </div>
  )
}
