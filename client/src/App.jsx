import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Chat from './pages/Chat.jsx';
import DocumentDetail from './pages/DocumentDetail.jsx';
import Documents from './pages/Documents.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';
import Register from './pages/Register.jsx';
import Search from './pages/Search.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/documents" replace />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/documents/:id" element={<DocumentDetail />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/chat/:conversationId" element={<Chat />} />
          <Route path="/search" element={<Search />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
