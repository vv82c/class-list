import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/', label: '课表', icon: '📅' },
  { to: '/capture', label: '拍照', icon: '📷' },
  { to: '/archive', label: '归档', icon: '🗂' },
];

export default function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-lg border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
              isActive ? 'text-sky-600' : 'text-slate-400'
            }`
          }
        >
          <span className="text-lg leading-none">{t.icon}</span>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
