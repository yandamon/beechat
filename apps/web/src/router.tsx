import { createBrowserRouter } from 'react-router';
import { ChatLayout } from './routes/chat-layout';
import { ChatWindow } from './routes/chat-window';
import { EmptyChat } from './routes/empty-chat';
import { FriendsPage } from './routes/friends-page';
import { PublicOnly, RequireAuth } from './routes/guards';
import { LoginPage } from './routes/login';
import { RegisterPage } from './routes/register';
import { RootLayout } from './routes/root-layout';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: RootLayout,
    children: [
      {
        Component: RequireAuth,
        children: [
          {
            Component: ChatLayout,
            children: [
              { index: true, Component: EmptyChat },
              { path: 'c/:conversationId', Component: ChatWindow },
              { path: 'friends', Component: FriendsPage },
            ],
          },
        ],
      },
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
