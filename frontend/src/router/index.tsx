import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../App';
import { ExportPreview } from '../pages/ExportPreview';
import { Profile } from '../pages/Profile';
import { ResumeEditor } from '../pages/ResumeEditor';
import { ResumeList } from '../pages/ResumeList';
import { TemplateGallery } from '../pages/TemplateGallery';
import { SharesPage } from '../share/SharesPage';

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
      { path: 'shares', element: <SharesPage /> },
      { path: 'profile', element: <Profile /> },
      { path: '*', element: <Navigate replace to="/resumes" /> },
    ],
  },
]);

