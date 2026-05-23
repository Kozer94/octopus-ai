import React, { useState } from 'react';
import './App.css'; // إضافة ملف CSS مخصص

function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16)).toString('hex');
  const hashedPassword = crypto.subtle.digest('SHA-256', new TextEncoder('utf-8').encode(password + salt)).then((hash) => {
    return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
  });
  return salt + hashedPassword;
}

function verifyPassword(storedPassword, providedPassword) {
  const salt = storedPassword.slice(0, 32);
  const storedHash = storedPassword.slice(32);
  const newHash = crypto.subtle.digest('SHA-256', new TextEncoder('utf-8').encode(providedPassword + salt)).then((hash) => {
    return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
  });
  return storedHash === newHash;
}

function secureLogin(username, password, storedCredentials) {
  if (username in storedCredentials) {
    const storedPassword = storedCredentials[username];
    if (verifyPassword(storedPassword, password)) {
      return true;
    }
  }
  return false;
}

function App() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [error, setError] = useState(null);
  const [storedCredentials, setStoredCredentials] = useState({});

  const handleLogin = (event) => {
    event.preventDefault();
    if (username && password) {
      const hashedPassword = hashPassword(password);
      if (secureLogin(username, password, storedCredentials)) {
        setIsLoggedIn(true);
      } else {
        setError('اسم المستخدم أو كلمة المرور غير صحيحة');
      }
    } else {
      setError('الرجاء إدخال اسم المستخدم وكلمة المرور');
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUsername('');
    setPassword('');
  };

  const handleRegister = (event) => {
    event.preventDefault();
    if (username && password) {
      const hashedPassword = hashPassword(password);
      setStoredCredentials((prevCredentials) => ({ ...prevCredentials, [username]: hashedPassword }));
      setIsLoggedIn(true);
    } else {
      setError('الرجاء إدخال اسم المستخدم وكلمة المرور');
    }
  };

  return (
    <div className="app">
      {isLoggedIn ? (
        <div className="logged-in">
          <h1>مرحباً {username}</h1>
          <button onClick={handleLogout}>تسجيل الخروج</button>
        </div>
      ) : (
        <div className="login-register">
          <h1>تسجيل الدخول</h1>
          <form onSubmit={handleLogin}>
            <label>
              اسم المستخدم:
              <input type="text" value={username} onChange={(event) => setUsername(event.target.value)} />
            </label>
            <br />
            <label>
              كلمة المرور:
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <br />
            <button type="submit">تسجيل الدخول</button>
          </form>
          <h1>تسجيل</h1>
          <form onSubmit={handleRegister}>
            <label>
              اسم المستخدم:
              <input type="text" value={username} onChange={(event) => setUsername(event.target.value)} />
            </label>
            <br />
            <label>
              كلمة المرور:
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <br />
            <button type="submit">تسجيل</button>
          </form>
          {error && <p style={{ color: 'red' }}>{error}</p>}
        </div>
      )}
    </div>
  );
}

export default App;
