interface SessionData {
  sessionId: string;
  code: string;
  pseudo: string;
}

function loadSession(): SessionData | null {
  if (typeof localStorage === 'undefined') return null;
  const stored = localStorage.getItem('manhunt_session');
  return stored ? JSON.parse(stored) : null;
}

export const sessionStore = $state<{ data: SessionData | null }>({
  data: loadSession(),
});

export function login(data: SessionData) {
  localStorage.setItem('manhunt_session', JSON.stringify(data));
  sessionStore.data = data;
}

export function logout() {
  localStorage.removeItem('manhunt_session');
  sessionStore.data = null;
}
