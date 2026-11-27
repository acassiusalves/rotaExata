'use client';
import { createContext,useContext } from 'react';
import type { User,UserCredential } from 'firebase/auth';

interface AuthContextType {
  user: User | null;
  userRole: string | null;
  mustChangePassword?: boolean;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<UserCredential>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
    user: null,
    userRole: null,
    mustChangePassword: false,
    loading: true,
    signIn: async () => { throw new Error('AuthProvider not initialized'); },
    signOut: async () => { throw new Error('AuthProvider not initialized'); },
});

export const useAuth = () => useContext(AuthContext);
