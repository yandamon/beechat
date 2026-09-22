import { createBrowserRouter } from 'react-router';
import { HomePage } from './routes/home';
import { RootLayout } from './routes/root-layout';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: RootLayout,
    children: [{ index: true, Component: HomePage }],
  },
]);
