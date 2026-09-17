import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { ShareViewer } from './share/ShareViewer';
import './styles/global.scss';

/**
 * 只读分享链接把快照放在 hash 中（#share/<token>），不依赖服务端路由。
 * 命中时挂载独立查看器：不渲染工作台导航，也不读取任何本机简历数据。
 * 从普通页面点击新快照链接（新标签打开）会直接落到此分支。
 */
function isShareHash(): boolean {
  return window.location.hash.startsWith('#share/');
}

function render(): void {
  const container = document.getElementById('root');
  if (!container) {
    return;
  }
  if (isShareHash()) {
    ReactDOM.createRoot(container).render(<ShareViewer />);
    return;
  }
  ReactDOM.createRoot(container).render(<RouterProvider router={router} />);
}

render();

// 同一标签页内从工作台跳到 #share/ 链接时不会自动重载；强制整页加载，
// 让查看器以独立、无本机数据的方式挂载。反向离开时同理。
window.addEventListener('hashchange', () => {
  const enteringShare = window.location.hash.startsWith('#share/');
  if (enteringShare) {
    window.location.reload();
  }
});
