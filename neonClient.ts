/**
 * Neon Client for React / Vite
 * Provides a drop-in Supabase-compatible client interface backed by Neon PostgreSQL and Vercel Serverless Functions.
 */

// Helper to convert File or Blob to Base64 or Text
async function readBlobData(blob: Blob): Promise<{ data: string; mime: string }> {
  const mime = blob.type || 'application/octet-stream';
  if (mime.startsWith('image/')) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ data: reader.result as string, mime });
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } else {
    const text = await blob.text();
    return { data: text, mime: mime || 'text/plain' };
  }
}

// Global Event Dispatcher for Realtime Multiuser sync
class RealtimeManager {
  private lastEventId = 0;
  private pollInterval: any = null;
  private channels = new Set<NeonChannel>();
  private isPolling = false;

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
    if (this.pollInterval) return;
    // Initial fetch to get latest event ID so we don't replay old history
    this.poll();
    this.pollInterval = setInterval(() => this.poll(), 2500);
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
      const res = await fetch(`/api/events?since_id=${this.lastEventId}`);
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
      headers: { 'Content-Type': 'application/json' },
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
  private pendingAction: 'select' | 'update' | 'delete' = 'select';
  private updateValues?: any;

  constructor(private table: string) {}

  select(columns = '*', options?: { count?: 'exact'; head?: boolean }) {
    this.columns = columns;
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
      }

      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
            headers: { 'Content-Type': 'application/json' },
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'upsert', table, rows, conflictCol: options?.conflictCol, select: true })
          });
          const json = await res.json();
          if (!res.ok) return { data: null, error: { message: json.error || res.statusText } };
          return { data: json.data, error: null };
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
              headers: { 'Content-Type': 'application/json' },
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
              headers: { 'Content-Type': 'application/json' },
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
