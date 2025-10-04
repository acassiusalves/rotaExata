
"use client";

import React, { useState, useEffect, createContext, useContext } from 'react';
import { User, onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase/client';
import { doc, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  userRole: string | null;
  mustChangePassword?: boolean;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<any>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    userRole: null,
    mustChangePassword: false,
    loading: true,
    signIn: async () => {},
    signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // User is signed in, fetch role from Firestore
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          const role = data?.role || 'vendedor';
          setUserRole(role);
          setMustChangePassword(data?.mustChangePassword || false);
          setUser(user);
        } else {
          // Handle case where user exists in Auth but not in Firestore
          console.warn(`User ${user.uid} found in Auth but not in Firestore.`);
          setUserRole('vendedor'); // default role
          setMustChangePassword(false);
          setUser(user);
        }
      } else {
        setUser(null);
        setUserRole(null);
        setMustChangePassword(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);
  
  const signIn = async (email: string, pass: string) => {
    return signInWithEmailAndPassword(auth, email, pass);
  }

  const signOut = async () => {
    setLoading(true);
    await firebaseSignOut(auth);
    setUser(null);
    setUserRole(null);
    setMustChangePassword(false);
    router.push('/login');
    setLoading(false);
  };

  const value = {
    user,
    userRole,
    mustChangePassword,
    loading,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>;
};

export const useAuth = () => {
  return useContext(AuthContext);
};
