import React, { useState } from 'react';
import axios from 'axios';
import { saveAuth } from '../utils/auth';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

export default function Auth({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');

  const submit = async () => {
    try {
      if (isLogin) {
        const res = await axios.post(`${API}/auth/login`, { email, password });
        saveAuth(res.data.token, res.data.user);
        window.location.href = '/lobby';
      } else {
        const res = await axios.post(`${API}/auth/register`, { username, email, password });
        saveAuth(res.data.token, res.data.user);
        window.location.href = '/lobby';
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Error');
    }
  };

  return (
    <div>
      <h2>{isLogin ? 'Login' : 'Register'}</h2>
      {!isLogin && (
        <div>
          <input placeholder="username" value={username} onChange={e => setUsername(e.target.value)} />
        </div>
      )}
      <div>
        <input placeholder="email" value={email} onChange={e => setEmail(e.target.value)} />
      </div>
      <div>
        <input placeholder="password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
      </div>
      <button onClick={submit}>{isLogin ? 'Login' : 'Register'}</button>
      <button onClick={() => setIsLogin(!isLogin)}>{isLogin ? 'Go to Register' : 'Go to Login'}</button>
    </div>
  );
}
