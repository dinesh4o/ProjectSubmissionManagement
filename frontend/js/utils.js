// Utility Functions

import { auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

// Show toast notification
export function showToast(message, type = 'info') {
    // Remove existing toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }

    // Create new toast
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Format timestamp
export function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString();
}

// Check if user is authenticated
export function checkAuth() {
    return new Promise((resolve, reject) => {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                resolve(user);
            } else {
                reject(null);
            }
        });
    });
}

// Redirect to login if not authenticated
export function requireAuth() {
    return new Promise((resolve, reject) => {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                resolve(user);
            } else {
                window.location.href = 'index.html';
                reject(null);
            }
        });
    });
}

// Get user role from Firestore
export async function getUserRole(userId) {
    const { db } = await import('./firebase-config.js');
    const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");
    
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
        return userDoc.data().role;
    }
    return null;
}

// Format date for datetime-local input
export function formatDateForInput(date) {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Check if date is past due
export function isPastDue(dueDate) {
    if (!dueDate) return false;
    const due = dueDate.toDate ? dueDate.toDate() : new Date(dueDate);
    return due < new Date();
}

// Escape HTML to prevent XSS
export function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}


