const fs = require('fs');
const file = 'src/pages/AdvisorDashboard.tsx';
let c = fs.readFileSync(file, 'utf8');

// FIX 1: Timer - remove minute step, auto-close on hour click
c = c.replace(
  /if \(mode === 'hour'\) \{ setTime\(\{ \.\.\.time, h: val \}\); setTimeout\(\(\) => setMode\('minute'\), 300\); \}\s*else setTime\(\{ \.\.\.time, m: val \}\);/,
  "(() => { let H = val; if (time.ampm === 'PM' && H < 12) H += 12; if (time.ampm === 'AM' && H === 12) H = 0; onSave(String(H).padStart(2,'0') + ':00'); onClose(); })()"
);

// FIX 2: Timer - only show hours on clock (remove minute items)
c = c.replace(
  /mode === 'hour' \? \[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11\] : \[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55\]/,
  "[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]"
);

// FIX 3: Timer header - remove minute display, just show hour
c = c.replace(
  /<span onClick=\{\(\) => setMode\('minute'\)\} style=\{\{ fontSize: 48.*?<\/span>\s*<\/div>/s,
  '</div>'
);

// FIX 4: Escalate - use POST /escalate endpoint
c = c.replace(
  /await updateTicketStatus\(ticket\.id, 'ESCALATED'\);\s*setLocalStatus\('ESCALATED'\);\s*onStatusChange\(ticket\.id, 'ESCALATED'\);\s*showToast\('🚨 Escalated — supervisor notified'\);/,
  "await apiFetch(`/tickets/${ticket.id}/escalate`, { method: 'POST', body: JSON.stringify({ reason: 'Escalated by consultant' }) });\n      setLocalStatus('ESCALATED');\n      onStatusChange(ticket.id, 'ESCALATED');\n      showToast('🚨 Escalated — supervisor notified');"
);

// FIX 5: Remove IN_PROGRESS from status buttons (backend rejects it)
c = c.replace(
  "const STATUSES = ['NEW', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];",
  "const STATUSES = ['NEW', 'OPEN', 'PENDING', 'RESOLVED', 'CLOSED'];"
);

// FIX 6: Username - fetch from /onboarding if /users returns no name
c = c.replace(
  /const raw = u\.name \|\| u\.fullName \|\| u\.displayName \|\|[\s\S]*?u\.identifier \|\| '';/,
  `let raw = u.name || u.fullName || u.displayName ||
                (u.firstName && u.lastName ? \`\${u.firstName} \${u.lastName}\` : '') ||
                u.firstName || u.username || u.email || u.identifier || '';
              if (!raw && f.userId) {
                try {
                  const token = localStorage.getItem('fin_token') || '';
                  const ob = await fetch(\`http://52.55.178.31:8081/api/onboarding/\${f.userId}\`, { headers: { Accept: 'application/json', Authorization: \`Bearer \${token}\` } });
                  if (ob.ok) { const od = await ob.json(); raw = od.name || od.fullName || od.firstName || od.email || ''; }
                } catch {}
              }`
);

fs.writeFileSync(file, c, 'utf8');
console.log('All fixes applied!');

// Verify
const result = fs.readFileSync(file, 'utf8');
console.log('Timer fix:', result.includes("onSave(String(H).padStart(2,'0') + ':00')") ? 'OK' : 'FAILED');
console.log('Escalate fix:', result.includes("/escalate") ? 'OK' : 'FAILED');
console.log('Status fix:', result.includes("'PENDING', 'RESOLVED'") ? 'OK' : 'FAILED');
