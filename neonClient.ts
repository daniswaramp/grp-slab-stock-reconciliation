/**
 * Neon Client for React / Vite
 * Backed by Neon Serverless PostgreSQL and Vercel Serverless Functions.
 * Includes client-side image compression, smart visibility polling, and full Supabase-compatible interface.
 */

function getAuthHeaders(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  const token = localStorage.getItem('slab_opname_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// Compress Image using Canvas before upload to conserve storage & bandwidth on Free Tier
async function readBlobData(blob: Blob): Promise<{ data: string; mime: string }> {
  const mime = blob.type || 'application/octet-stream';
  if (mime.startsWith('image/')) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxDim = 1280;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.72);
          resolve({ data: compressedDataUrl, mime: 'image/jpeg' });
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve({ data: reader.result as string, mime: 'image/jpeg' });
        reader.readAsDataURL(blob);
      };
      img.onerror = () => {
        const reader = new FileReader();
        reader.onload = () => resolve({ data: reader.result as string, mime });
        reader.readAsDataURL(blob);
      };
      img.src = url;
    });
  } else {
    const text = await blob.text();
    return { data: text, mime: mime || 'text/plain' };
  }
}

// Global Event Dispatcher with Visibility State awareness (stops polling when tab is hidden)
class RealtimeManager {
  private lastEventId = -1; // -1 means uninitialized
  private pollInterval: any = null;
  private channels = new Set<NeonChannel>();
  private isPolling = false;

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.stopPolling();
        } else if (this.channels.size > 0) {
          this.poll();
          this.startPolling();
        }
      });
    }
  }

  addChannel(channel: NeonChannel) {
    this.channels.add(channel);
    this.startPolling();
  }

  removeChannel(channel: NeonChannel) {
    this.channels.delete(channel);
    if (this.channels.size === 0) {
      this.stopPolling();
    }
  }

  private startPolling() {
    if (this.pollInterval || (typeof document !== 'undefined' && document.hidden)) return;
    this.pollInterval = setInterval(() => this.poll(), 5000);
  }

  private stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private async poll() {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      // 1. Initial connection: fetch latest_id to skip historic events
      if (this.lastEventId === -1) {
        const initRes = await fetch('/api/events?latest=true', {
          headers: { ...getAuthHeaders() }
        });
        if (initRes.ok) {
          const initJson = await initRes.json();
          this.lastEventId = typeof initJson.latest_id === 'number' ? initJson.latest_id : 0;
        } else {
          this.lastEventId = 0;
        }
        return;
      }

      // 2. Poll for new events since last seen ID
      const res = await fetch(`/api/events?since_id=${this.lastEventId}`, {
        headers: { ...getAuthHeaders() }
      });
      if (!res.ok) return;
      const { events } = await res.json();

      if (Array.isArray(events) && events.length > 0) {
        for (const evt of events) {
          if (evt.id > this.lastEventId) {
            this.lastEventId = evt.id;
          }
          this.dispatchEvent(evt);
        }
      }
    } catch (e) {
      // Non-blocking network error
    } finally {
      this.isPolling = false;
    }
  }

  private dispatchEvent(evt: { id: number; event_type: string; payload: any }) {
    for (const channel of this.channels) {
      channel._handleIncomingEvent(evt);
    }
  }
}

const realtimeManager = new RealtimeManager();

export class NeonChannel {
  private listeners: Array<{
    type: string;
    filter: any;
    callback: (payload: any) => void;
  }> = [];

  constructor(public name: string) {}

  on(type: string, filter: any, callback?: (payload: any) => void) {
    if (typeof filter === 'function') {
      this.listeners.push({ type, filter: {}, callback: filter });
    } else {
      this.listeners.push({ type, filter: filter || {}, callback: callback || (() => {}) });
    }
    return this;
  }

  subscribe(callback?: (status: string) => void) {
    realtimeManager.addChannel(this);
    if (callback) {
      setTimeout(() => callback('SUBSCRIBED'), 0);
    }
    return this;
  }

  async send(msg: { type: string; event: string; payload: any }) {
    await fetch('/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        event_type: msg.event,
        payload: msg.payload
      })
    });
  }

  _handleIncomingEvent(evt: { id: number; event_type: string; payload: any }) {
    const rawPayload = typeof evt.payload === 'string' ? JSON.parse(evt.payload) : evt.payload;

    for (const l of this.listeners) {
      if (l.type === 'broadcast') {
        const expectedEvent = l.filter?.event;
        if (!expectedEvent || expectedEvent === '*' || expectedEvent === evt.event_type) {
          l.callback({
            event: evt.event_type,
            payload: rawPayload
          });
        }
      } else if (l.type === 'postgres_changes') {
        const targetTable = l.filter?.table;
        const targetEvent = l.filter?.event;

        let matched = false;
        let changeType = 'UPDATE';

        if (evt.event_type.startsWith('OPNAME_') && targetTable === 'opname_records') {
          matched = true;
          changeType = evt.event_type.replace('OPNAME_', '');
        } else if (evt.event_type.startsWith('LOCATION_') && targetTable === 'locations') {
          matched = true;
          changeType = evt.event_type.replace('LOCATION_', '');
        } else if (evt.event_type.startsWith('SETTINGS_') && targetTable === 'system_settings') {
          matched = true;
          changeType = evt.event_type.replace('SETTINGS_', '');
        } else if (evt.event_type.startsWith('USERS_ONLINE_') && targetTable === 'users_online') {
          matched = true;
          changeType = evt.event_type.replace('USERS_ONLINE_', '');
        }

        if (matched && (!targetEvent || targetEvent === '*' || targetEvent === changeType)) {
          l.callback({
            eventType: changeType,
            new: changeType !== 'DELETE' ? rawPayload : null,
            old: changeType === 'DELETE' ? rawPayload : null
          });
        }
      }
    }
  }
}

class QueryBuilder {
  private filters: Array<{ column: string; op: string; value: any }> = [];
  private columns = '*';
  private orderByConfig?: { column: string; ascending?: boolean };
  private limitCount?: number;
  private offsetCount?: number;
  private countMode?: string;
  private headMode = false;
  private isSingle = false;
  private wantsReturning = false;
  private pendingAction: 'select' | 'update' | 'delete' = 'select';
  private updateValues?: any;

  constructor(private table: string) {}

  select(columns = '*', options?: { count?: 'exact'; head?: boolean }) {
    this.columns = columns;
    this.wantsReturning = true;
    if (options?.count) this.countMode = options.count;
    if (options?.head) this.headMode = options.head;
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderByConfig = { column, ascending: options?.ascending !== false };
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number) {
    this.offsetCount = from;
    this.limitCount = to - from + 1;
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ column, op: 'eq', value });
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push({ column, op: 'neq', value });
    return this;
  }

  ilike(column: string, pattern: string) {
    this.filters.push({ column, op: 'ilike', value: pattern });
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  update(values: any) {
    this.pendingAction = 'update';
    this.updateValues = values;
    return this;
  }

  delete() {
    this.pendingAction = 'delete';
    return this;
  }

  async then(resolve: (value: any) => void, reject?: (reason: any) => void) {
    try {
      const body: any = {
        action: this.pendingAction,
        table: this.table,
        filters: this.filters
      };

      if (this.pendingAction === 'select') {
        body.columns = this.columns;
        body.orderBy = this.orderByConfig;
        body.limit = this.limitCount;
        body.offset = this.offsetCount;
        body.count = this.countMode;
        body.head = this.headMode;
        body.single = this.isSingle;
      } else if (this.pendingAction === 'update') {
        body.values = this.updateValues;
        body.select = this.wantsReturning || true;
      }

      const res = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        resolve({ data: null, error: { message: errJson.error || res.statusText }, count: 0 });
        return;
      }

      const json = await res.json();
      resolve({ data: json.data, error: null, count: json.count });
    } catch (err: any) {
      if (reject) reject(err);
      else resolve({ data: null, error: { message: err.message }, count: 0 });
    }
  }
}

export const neonClient = {
  from(table: string) {
    const builder = new QueryBuilder(table);
    return {
      select(columns = '*', options?: { count?: 'exact'; head?: boolean }) {
        return builder.select(columns, options);
      },
      async insert(rows: any | any[]) {
        try {
          const res = await fetch('/api/query', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...getAuthHeaders()
            },
            body: JSON.stringify({ action: 'insert', table, rows, select: true })
          });
          const json = await res.json();
          if (!res.ok) return { data: null, error: { message: json.error || res.statusText } };
          return { data: json.data, error: null };
        } catch (err: any) {
          return { data: null, error: { message: err.message } };
        }
      },
      async upsert(rows: any | any[], options?: { conflictCol?: string }) {
        try {
          const res = await fetch('/api/query', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...getAuthHeaders()
            },
            body: JSON.stringify({ action: 'upsert', table, rows, conflictCol: options?.conflictCol, select: true })
          });
          const json = await res.json();
          if (!res.ok) return { data: null, error: { message: json.error || res.statusText } };
          return { data: json.data, error: null };
        } catch (err: any) {
          return { data: null, error: { message: err.message } };
        }
      },
      async replaceRows(rows: any[]) {
        try {
          const res = await fetch('/api/query', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...getAuthHeaders()
            },
            body: JSON.stringify({ action: 'replace_table_rows', table, rows })
          });
          const json = await res.json();
          if (!res.ok) return { data: null, error: { message: json.error || res.statusText } };
          return { data: json, error: null };
        } catch (err: any) {
          return { data: null, error: { message: err.message } };
        }
      },
      update(values: any) {
        return builder.update(values);
      },
      delete() {
        return builder.delete();
      }
    };
  },

  storage: {
    from(_bucketName: string) {
      return {
        async upload(path: string, fileOrBlob: any, _options?: any) {
          try {
            const { data, mime } = await readBlobData(fileOrBlob);
            const res = await fetch('/api/storage', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
              },
              body: JSON.stringify({ path, mime_type: mime, data })
            });
            const json = await res.json();
            if (!res.ok) return { data: null, error: { message: json.error || res.statusText } };
            return { data: { path: json.path }, error: null };
          } catch (err: any) {
            return { data: null, error: { message: err.message } };
          }
        },

        getPublicUrl(path: string) {
          return {
            data: {
              publicUrl: `/api/storage?path=${encodeURIComponent(path)}`
            }
          };
        },

        async remove(paths: string[]) {
          try {
            const res = await fetch('/api/storage', {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
              },
              body: JSON.stringify({ paths })
            });
            if (!res.ok) {
              const json = await res.json().catch(() => ({}));
              return { error: { message: json.error || res.statusText } };
            }
            return { error: null };
          } catch (err: any) {
            return { error: { message: err.message } };
          }
        }
      };
    }
  },

  channel(name: string) {
    return new NeonChannel(name);
  },

  removeChannel(channel: NeonChannel) {
    realtimeManager.removeChannel(channel);
  }
};

// Aliased as supabase for seamless backward compatibility across components
export const supabase = neonClient;
export default neonClient;
