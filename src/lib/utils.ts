import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const OWNER_EMAIL = 'emailparasiteslixo@gmail.com';

export function isOwner(email?: string | null, name?: string | null): boolean {
  if (email) {
    const clean = email.trim().toLowerCase();
    if (
      clean === OWNER_EMAIL.toLowerCase() ||
      clean === 'andre' ||
      clean === 'andre@gestao.igreja' ||
      clean.startsWith('andre@') ||
      clean === 'admin' ||
      clean === 'admin@gestao.igreja' ||
      clean.startsWith('admin@')
    ) {
      return true;
    }
  }
  if (name) {
    const cleanName = name.trim().toLowerCase();
    if (
      cleanName === 'andre' || 
      cleanName.startsWith('andre ') ||
      cleanName === 'administrador' ||
      cleanName.includes('administrador')
    ) {
      return true;
    }
  }
  return false;
}

export function isOwnerEmail(email?: string | null): boolean {
  return isOwner(email);
}
