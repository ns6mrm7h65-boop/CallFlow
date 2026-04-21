const SubscriptionManager = {
  subscriptions: {},
  _listeners: [],

  subscribe(key, table, onEvent) {
    if (this.subscriptions[key]) this.close(key);

    const ws = new WebSocket(
      `${SUPABASE_URL.replace('https','wss')}/realtime/v1/websocket?apikey=${SUPABASE_ANON}&vsn=1.0.0`
    );

    ws.onopen = () => {
      ws.send(JSON.stringify({
        topic: `realtime:public:${table}`,
        event: 'phx_join',
        payload: { config: { broadcast: { self: true }, presence: { key: '' } } },
        ref: '1'
      }));
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.event === 'INSERT' || msg.event === 'UPDATE' || msg.event === 'DELETE') {
        onEvent({ type: msg.event, record: msg.payload?.record });
      }
    };

    ws.onerror = () => {};

    ws.onclose = () => {
      if (this.subscriptions[key] === ws) delete this.subscriptions[key];
    };

    this.subscriptions[key] = ws;
    return ws;
  },

  close(key) {
    const ws = this.subscriptions[key];
    if (ws) { ws.close(); delete this.subscriptions[key]; }
  },

  closeAll() {
    Object.keys(this.subscriptions).forEach(k => this.close(k));
  },

  getActiveCount() { return Object.keys(this.subscriptions).length; },
  getActiveKeys()  { return Object.keys(this.subscriptions); }
};
