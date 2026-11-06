// Thin wrapper over the Ghost Admin API. Uses a custom integration key (Ghost Admin > Integrations).
import GhostAdminAPI from '@tryghost/admin-api';
import axios from 'axios';
import { nextTags } from './workflow.js';

// url: where the dashboard reaches Ghost (internal, e.g. http://ghost:2368)
// publicUrl: the admin address people open in a browser (for "Open in Ghost" links)
export function ghostClient({ url, key, publicUrl }) {
  const pub = (publicUrl || url).replace(/\/$/, '');
  const options = { url, key, version: 'v6.0' };
  if (publicUrl && publicUrl !== url) {
    // Talking to Ghost over the private Docker network: present the public admin host and https,
    // so Ghost treats the request exactly like one coming through Caddy.
    const host = new URL(publicUrl).host;
    options.makeRequest = ({ url: u, method, data, params = {}, headers = {} }) => axios({
      url: u, method, data, params,
      headers: { ...headers, Host: host, 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': host },
      maxRedirects: 0,
      paramsSerializer: (p) => Object.keys(p).map(k => `${k}=${encodeURIComponent([].concat(p[k]).join(','))}`).join('&'),
    }).then(r => r.data);
  }
  const api = new GhostAdminAPI(options);

  return {
    adminUrl: pub,

    async getPost(id) {
      return api.posts.read({ id, include: 'tags,authors', formats: 'html' });
    },

    // Drafts written by a given staff email (for the "submit" screen).
    async draftsByEmail(email) {
      const posts = await api.posts.browse({ filter: 'status:draft', include: 'authors,tags', limit: 100, order: 'updated_at desc' });
      return posts.filter(p => (p.authors || []).some(a => a.email && a.email.toLowerCase() === email.toLowerCase()));
    },

    // A guest piece accepted by an editor. Ghost matches the author by email and falls back to the site owner.
    async createDraft({ title, html, tags, authorEmail }) {
      const post = { title, html, status: 'draft', tags };
      if (authorEmail) post.authors = [{ email: authorEmail }];
      return api.posts.add(post, { source: 'html' });
    },

    async setWorkflowTags(id, status, rating) {
      const post = await api.posts.read({ id, include: 'tags' });
      return api.posts.edit({ id, updated_at: post.updated_at, tags: nextTags(post.tags || [], status, rating) });
    },

    async publish(id, rating) {
      const post = await api.posts.read({ id, include: 'tags' });
      return api.posts.edit({ id, updated_at: post.updated_at, status: 'published', tags: nextTags(post.tags || [], 'published', rating) });
    },

    async schedule(id, rating, publishAt) {
      const post = await api.posts.read({ id, include: 'tags' });
      return api.posts.edit({
        id, updated_at: post.updated_at, status: 'scheduled', published_at: new Date(publishAt).toISOString(),
        tags: nextTags(post.tags || [], 'scheduled', rating),
      });
    },

    async unschedule(id, rating) {
      const post = await api.posts.read({ id, include: 'tags' });
      return api.posts.edit({ id, updated_at: post.updated_at, status: 'draft', tags: nextTags(post.tags || [], 'approved', rating) });
    },

    editorLink: (id) => `${pub}/ghost/#/editor/post/${id}`,
    previewLink: (post) => post?.uuid ? `${pub}/p/${post.uuid}/` : null,
  };
}
