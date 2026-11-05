// A Promise that settles at once: the EffectCraft host answers synchronously, and script hosts do not
// always drain the job queue before a script returns.
function SyncPromise(exec) {
  var me = this; me.s = 0; me.v = undefined; me.q = [];
  function settle(s, v) {
    if (me.s) return;
    if (s === 1 && v && typeof v.then === "function") { try { v.then(function (x) { settle(1, x); }, function (e) { settle(2, e); }); } catch (e) { settle(2, e); } return; }
    me.s = s; me.v = v; var q = me.q; me.q = []; for (var i = 0; i < q.length; i++) q[i]();
  }
  try { exec(function (v) { settle(1, v); }, function (e) { settle(2, e); }); } catch (e) { settle(2, e); }
}
SyncPromise.prototype.then = function (ok, bad) {
  var me = this;
  return new SyncPromise(function (res, rej) {
    function run() {
      var f = me.s === 1 ? ok : bad;
      if (typeof f !== "function") { (me.s === 1 ? res : rej)(me.v); return; }
      try { res(f(me.v)); } catch (e) { rej(e); }
    }
    if (me.s) run(); else me.q.push(run);
  });
};
SyncPromise.prototype["catch"] = function (bad) { return this.then(null, bad); };
SyncPromise.resolve = function (v) { return v instanceof SyncPromise ? v : new SyncPromise(function (res) { res(v); }); };
SyncPromise.reject = function (e) { return new SyncPromise(function (res, rej) { rej(e); }); };
SyncPromise.all = function (list) {
  return new SyncPromise(function (res, rej) {
    var out = [], left = list.length; if (!left) { res(out); return; }
    for (var i = 0; i < list.length; i++) (function (i) { SyncPromise.resolve(list[i]).then(function (v) { out[i] = v; if (!--left) res(out); }, rej); })(i);
  });
};
var Promise = SyncPromise;
