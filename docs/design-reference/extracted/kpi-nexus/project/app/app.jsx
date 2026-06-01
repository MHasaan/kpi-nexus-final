/* global React, ReactDOM, Sidebar, Header, CommandPalette, DashboardView, KpisView, KpiDetailView, DashboardsView, AskView, StubView */
const { useState: useStateA, useEffect: useEffectA } = React;

const TITLES = {
  dashboard: { title: 'Dashboard', crumbs: ['Home'] },
  kpis: { title: 'KPIs', crumbs: ['Workspace'] },
  kpiDetail: { title: 'KPI detail', crumbs: ['Workspace', 'KPIs'] },
  dashboards: { title: 'Dashboards', crumbs: ['Workspace'] },
  alerts: { title: 'Alerts', crumbs: ['Workspace'] },
  insights: { title: 'Insights', crumbs: ['Intelligence'] },
  ask: { title: 'Ask', crumbs: ['Intelligence'] },
  okrs: { title: 'OKRs', crumbs: ['Execute'] },
  tasks: { title: 'Tasks', crumbs: ['Execute'] },
  approvals: { title: 'Approvals', crumbs: ['Execute'] },
  reports: { title: 'Reports', crumbs: ['Execute'] },
  people: { title: 'People & org', crumbs: ['Organize'] },
  integrations: { title: 'Integrations', crumbs: ['Organize'] },
  activity: { title: 'Activity', crumbs: ['Organize'] },
  settings: { title: 'Settings', crumbs: ['Organize'] },
};

function App() {
  const [theme, setTheme] = useStateA(() => localStorage.getItem('kn-theme') || 'light');
  const [view, setView] = useStateA('dashboard');
  const [collapsed, setCollapsed] = useStateA(false);
  const [paletteOpen, setPaletteOpen] = useStateA(false);
  const [activeKpi, setActiveKpi] = useStateA(null);

  useEffectA(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('kn-theme', theme);
  }, [theme]);

  useEffectA(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((p) => !p); }
      if (e.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openKpi = (k) => { setActiveKpi(k); setView('kpiDetail'); };
  const navTo = (v) => { setView(v); };

  const meta = TITLES[view] || TITLES.dashboard;

  let content;
  switch (view) {
    case 'dashboard': content = <DashboardView openKpi={openKpi} />; break;
    case 'kpis': content = <KpisView openKpi={openKpi} />; break;
    case 'kpiDetail': content = <KpiDetailView kpi={activeKpi} back={() => setView('kpis')} />; break;
    case 'dashboards': content = <DashboardsView />; break;
    case 'ask': content = <AskView />; break;
    case 'alerts': content = <AlertsView />; break;
    case 'insights': content = <InsightsView />; break;
    case 'okrs': content = <OkrsView />; break;
    case 'tasks': content = <TasksView />; break;
    case 'reports': content = <ReportsView />; break;
    case 'approvals': content = <ApprovalsView />; break;
    case 'activity': content = <ActivityView />; break;
    case 'people': content = <PeopleView />; break;
    case 'integrations': content = <IntegrationsView />; break;
    case 'settings': content = <SettingsView />; break;
    default: content = <DashboardView openKpi={openKpi} />;
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-surface-bg)' }}>
      <Sidebar view={view === 'kpiDetail' ? 'kpis' : view} setView={navTo} collapsed={collapsed} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Header
          title={meta.title}
          crumbs={meta.crumbs}
          theme={theme}
          toggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          onSearch={() => setPaletteOpen(true)}
          onToggleSidebar={() => setCollapsed((c) => !c)}
        />
        <main style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 48px' }}>
          <div key={view} className="kn-view" style={{ maxWidth: view === 'ask' ? 860 : 1180, margin: '0 auto' }}>{content}</div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} setView={navTo} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
