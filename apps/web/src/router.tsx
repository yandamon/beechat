import { createBrowserRouter } from 'react-router';
import { PublicOnly, RequireAuth } from './routes/guards';
import { HomePage } from './routes/home';
import { LoginPage } from './routes/login';
import { RegisterPage } from './routes/register';
import { RootLayout } from './routes/root-layout';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: RootLayout,
    children: [
      { Component: RequireAuth, children: [{ index: true, Component: HomePage }] },
      {
        Component: PublicOnly,
        children: [
          { path: 'login', Component: LoginPage },
          { path: 'register', Component: RegisterPage },
        ],
      },
    ],
  },
]);
