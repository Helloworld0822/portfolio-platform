import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { clearToken, getToken, setToken } from "./api";

interface AuthUser {
  username: string;
  avatarUrl: string | null;
  isAdmin: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (returnTo: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function decodeUser(token: string): AuthUser | null {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(normalized));

    return {
      username: json.sub,
      avatarUrl: json.avatar_url ?? null,
      isAdmin: json.role === "admin",
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const token = getToken();
    return token ? decodeUser(token) : null;
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = hashParams.get("token") ?? params.get("token");
    if (!token) {
      return;
    }

    setToken(token);
    setUser(decodeUser(token));

    params.delete("token");
    params.delete("error");
    hashParams.delete("token");
    const query = params.toString();
    const hash = hashParams.toString();
    const cleanUrl = `${window.location.pathname}${query ? `?${query}` : ""}${
      hash ? `#${hash}` : ""
    }`;
    window.history.replaceState({}, "", cleanUrl);
  }, []);

  const login = (returnTo: string) => {
    window.location.href = `/api/auth/github/login?state=${encodeURIComponent(returnTo)}`;
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
