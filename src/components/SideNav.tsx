import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { getCourses } from '../storage/db';
import type { Course } from '../types';

const links = [
  { to: '/', label: '课表', icon: '📅' },
  { to: '/capture', label: '拍照采集', icon: '📷' },
  { to: '/archive', label: '全部照片', icon: '🗂' },
  { to: '/sync', label: '备份', icon: '🔄' },
];

/** 宽屏左侧导航：功能入口 + 课程直达 */
export default function SideNav() {
  const [courses, setCourses] = useState<Course[]>([]);
  useEffect(() => {
    getCourses().then(setCourses);
  }, []);

  return (
    <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1 border-r border-slate-200 bg-white p-3 lg:flex">
      <p className="mb-2 px-2 text-lg font-bold">课堂归档</p>
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.to === '/'}
          className={({ isActive }) =>
            `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
              isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`
          }
        >
          <span>{l.icon}</span>
          {l.label}
        </NavLink>
      ))}
      {courses.length > 0 && (
        <>
          <p className="mt-4 px-3 text-xs text-slate-400">我的课程</p>
          {courses.map((c) => (
            <NavLink
              key={c.id}
              to={`/course/${c.id}`}
              className={({ isActive }) =>
                `flex items-center gap-2 truncate rounded-lg px-3 py-1.5 text-sm ${
                  isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
              <span className="truncate">{c.name}</span>
            </NavLink>
          ))}
        </>
      )}
    </aside>
  );
}
