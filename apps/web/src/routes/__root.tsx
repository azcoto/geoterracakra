import { Link, Outlet, createRootRoute } from '@tanstack/react-router';
import '../styles.css';

export const Route = createRootRoute({
  component: () => (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/">
          <span aria-hidden="true" className="brand-mark">
            GT
          </span>
          <span>
            <strong>GeoTerraCakra</strong>
            <small>Landcover intelligence</small>
          </span>
        </Link>
        <span className="topbar-context">Indonesia</span>
      </header>
      <Outlet />
    </div>
  ),
});
