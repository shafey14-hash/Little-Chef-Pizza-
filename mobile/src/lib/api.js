// src/lib/api.js
//
// Thin wrapper around the Vercel serverless endpoints (/api/*). The web
// app calls these same-origin; the native app must use the absolute base.

import { API_BASE } from "../config";

async function post(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body || {}),
    });
  } catch (e) {
    throw new Error("Network error — check your internet connection.");
  }

  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    /* non-JSON body — fall through with empty object */
  }

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const apiPost = (path, body) => post(path, body);
export const apiPostAuthed = (path, body, token) => post(path, body, token);
