import { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { isDeliverablesTeamMember } from '../../utils/freelance';

export function PostProductionTeamScreen(): React.JSX.Element {
  const studio = useApp();
  const members = useMemo(() => studio.team
    .filter(member => member.active !== false && isDeliverablesTeamMember(member))
    .sort((a, b) => a.name.localeCompare(b.name)), [studio.team]);

  return <div className="screen">
    <header><div><h2>Post Production team</h2></div></header>
    <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
      {members.length === 0 ? <div className="empty"><h3>No Post Production team members</h3><p>Add video editors, photo editors, and album designers in Team Management.</p></div>
        : members.map(member => {
          const assigned = studio.freelanceJobs.filter(job => job.editorMemberId === member.id && job.stage !== 'completed').length;
          return <div key={member.id} style={{ padding: '16px 18px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
            <div><div className="job-title">{member.name}</div><div className="sub">{member.role || 'Post Production team member'}</div></div>
            <div className="muted" style={{ fontSize: 13 }}>{assigned} active project{assigned === 1 ? '' : 's'}</div>
          </div>;
        })}
    </div>
  </div>;
}
