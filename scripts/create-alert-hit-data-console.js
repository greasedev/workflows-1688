(() => {
  const CONFIG = {
    // Leave empty to auto-detect the IndexedDB database that contains product_alert.
    DB_NAME: "",
    CLEAR_EXISTING_ALERTS: false,
  };

  const STORES = {
    product: "product",
    productAlert: "product_alert",
    settings: "settings",
  };
  const DEFAULT_STOCK_THRESHOLD = 100;

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  function openDatabase(name) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function findDatabaseName() {
    if (CONFIG.DB_NAME) return CONFIG.DB_NAME;
    if (typeof indexedDB.databases !== "function") {
      throw new Error("当前浏览器不支持 indexedDB.databases()，请在 CONFIG.DB_NAME 中填写数据库名。");
    }

    const databases = await indexedDB.databases();
    for (const info of databases) {
      if (!info.name) continue;
      const db = await openDatabase(info.name);
      const storeNames = Array.from(db.objectStoreNames);
      db.close();

      if (storeNames.includes(STORES.productAlert)) {
        return info.name;
      }
    }

    throw new Error("没有找到包含 product_alert 表的 IndexedDB 数据库。");
  }

  async function getAll(db, storeName) {
    if (!db.objectStoreNames.contains(storeName)) return [];
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    return requestToPromise(store.getAll());
  }

  async function addAll(db, storeName, records) {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    for (const record of records) {
      store.add(record);
    }
    await transactionDone(transaction);
  }

  async function clearStore(db, storeName) {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    store.clear();
    await transactionDone(transaction);
  }

  function fallbackProduct(index) {
    const id = 900000000 + index;
    return {
      name: `测试商品 ${index}`,
      spec: `测试规格 ${index}`,
      url: `https://detail.1688.com/offer/${id}.html`,
      price: 100 + index * 10,
      stock: 120 + index * 10,
    };
  }

  function normalizeProduct(product, index) {
    const fallback = fallbackProduct(index);
    return {
      name: product?.name || fallback.name,
      spec: product?.spec || fallback.spec,
      url: product?.url || fallback.url,
      price: Number.isFinite(product?.price) ? product.price : fallback.price,
      stock: Number.isFinite(product?.stock) ? product.stock : fallback.stock,
    };
  }

  function buildAlerts(products, stockThreshold) {
    const now = Date.now();
    const sourceProducts = [
      normalizeProduct(products[0], 1),
      normalizeProduct(products[1], 2),
      normalizeProduct(products[2], 3),
    ];
    const lowStockValue = Math.max(0, stockThreshold - 1);

    return [
      {
        url: sourceProducts[0].url,
        name: sourceProducts[0].name,
        spec: sourceProducts[0].spec,
        hitTypes: ["missing"],
        previousPrice: sourceProducts[0].price,
        previousStock: sourceProducts[0].stock === -1 ? stockThreshold + 20 : sourceProducts[0].stock,
        stockThreshold,
        checkedAt: new Date(now).toISOString(),
      },
      {
        url: sourceProducts[1].url,
        name: sourceProducts[1].name,
        spec: sourceProducts[1].spec,
        hitTypes: ["price_increase"],
        previousPrice: sourceProducts[1].price,
        currentPrice: sourceProducts[1].price + 20,
        previousStock: sourceProducts[1].stock,
        currentStock: sourceProducts[1].stock,
        stockThreshold,
        checkedAt: new Date(now - 60 * 1000).toISOString(),
      },
      {
        url: sourceProducts[2].url,
        name: sourceProducts[2].name,
        spec: sourceProducts[2].spec,
        hitTypes: ["low_stock"],
        previousPrice: sourceProducts[2].price,
        currentPrice: sourceProducts[2].price,
        previousStock: Math.max(stockThreshold + 20, 20),
        currentStock: lowStockValue,
        stockThreshold,
        checkedAt: new Date(now - 2 * 60 * 1000).toISOString(),
      },
    ];
  }

  async function main() {
    const dbName = await findDatabaseName();
    const db = await openDatabase(dbName);

    try {
      const [products, settings] = await Promise.all([
        getAll(db, STORES.product),
        getAll(db, STORES.settings),
      ]);
      const globalSettings = settings.find((item) => item?.id === "global");
      const stockThreshold = Number.isInteger(globalSettings?.stockAlertThreshold)
        ? globalSettings.stockAlertThreshold
        : DEFAULT_STOCK_THRESHOLD;
      const alerts = buildAlerts(products, stockThreshold);

      if (CONFIG.CLEAR_EXISTING_ALERTS) {
        await clearStore(db, STORES.productAlert);
      }
      await addAll(db, STORES.productAlert, alerts);

      console.log(`已写入 ${alerts.length} 条监控报警测试数据。数据库：${dbName}`);
      console.table(alerts.map((alert) => ({
        name: alert.name,
        spec: alert.spec,
        hitTypes: alert.hitTypes.join(", "),
        url: alert.url,
        checkedAt: alert.checkedAt,
      })));
      console.log("刷新页面后可在「监控报警」中查看。");
    } finally {
      db.close();
    }
  }

  main().catch((error) => {
    console.error("构造监控报警测试数据失败：", error);
  });
})();
