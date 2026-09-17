import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../App';
import { ExportPreview } from '../pages/ExportPreview';
import { Profile } from '../pages/Profile';
import { ResumeEditor } from '../pages/ResumeEditor';
import { ResumeList } from '../pages/ResumeList';
import { SharedResume } from '../pages/SharedResume';
import { TemplateGallery } from '../pages/TemplateGallery';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate replace to="/resumes" /> },
      { path: 'resumes', element: <ResumeList /> },
      { path: 'resumes/:id/edit', element: <ResumeEditor /> },
      { path: 'resumes/:id/export', element: <ExportPreview /> },
      { path: 'templates', element: <TemplateGallery /> },
      { path: 'profile', element: <Profile /> },
      { path: '*', element: <Navigate replace to="/resumes" /> },
    ],
  },
  // 只读分享台独立于主布局：打开链接不进入工作区，也不触碰本机简历数据
  { path: '/share', element: <SharedResume /> },
]);
