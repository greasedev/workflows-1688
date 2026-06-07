(async () => {
  const urls = product_urls_json_string;

  const BATCH_SIZE = 30;
  const WAIT_TIMEOUT = 60_000;
  const POLL_INTERVAL = 300;
  const POST_CLICK_SETTLE_DELAY = 1_000;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const isVisible = (element) => {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) !== 0 &&
      rect.width > 0 &&
      rect.height > 0
    );
  };

  const waitFor = async (predicate, description, timeout = WAIT_TIMEOUT) => {
    const startedAt = Date.now();
    let lastError;

    while (Date.now() - startedAt < timeout) {
      try {
        const result = predicate();
        if (result) return result;
      } catch (error) {
        lastError = error;
      }
      await sleep(POLL_INTERVAL);
    }

    const suffix = lastError ? `；最后一次错误：${lastError.message}` : "";
    throw new Error(`等待超时：${description}${suffix}`);
  };

  const normalizeText = (value) =>
    String(value ?? "")
      .replace(/\u200B/g, "")
      .trim();

  const findVisibleButton = (text) =>
    [...document.querySelectorAll("button")].find(
      (button) => isVisible(button) && normalizeText(button.textContent) === text,
    );

  const findEditorRoot = () => {
    const candidates = [...document.querySelectorAll("#shop-window-url-edit")];
    return candidates.find(isVisible);
  };

  const getWritableElement = (root) => {
    if (
      root.matches("textarea, input, [contenteditable='true'], [contenteditable='plaintext-only']")
    ) {
      return root;
    }

    return (
      root.querySelector(
        "textarea, input, [contenteditable='true'], [contenteditable='plaintext-only']",
      ) || root
    );
  };

  const readEditorText = (root) => {
    const writable = getWritableElement(root);
    if ("value" in writable) return normalizeText(writable.value);
    return normalizeText(writable.textContent);
  };

  const dispatchInputEvents = (element, text, inputType = "insertText") => {
    try {
      element.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType,
          data: text,
        }),
      );
    } catch (_) {
      // Older page runtimes may not allow constructing InputEvent.
    }

    try {
      element.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType,
          data: text,
        }),
      );
    } catch (_) {
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }

    element.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const setNativeValue = (element, value) => {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

    if (setter) setter.call(element, value);
    else element.value = value;

    dispatchInputEvents(element, value);
  };

  const selectAllContents = (element) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const dispatchPaste = (element, text) => {
    try {
      const data = new DataTransfer();
      data.setData("text/plain", text);
      element.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: data,
        }),
      );
    } catch (_) {
      // Continue with direct DOM insertion when synthetic paste is unavailable.
    }
  };

  const writeEditor = async (root, text) => {
    const writable = getWritableElement(root);
    writable.focus();

    if ("value" in writable) {
      setNativeValue(writable, text);
    } else {
      selectAllContents(writable);
      dispatchPaste(writable, text);

      // Give the page paste handler a chance before applying the DOM fallback.
      await sleep(100);
      if (!readEditorText(root)) {
        writable.textContent = text;
        dispatchInputEvents(writable, text);
      }
    }

    writable.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter" }));
    writable.blur();
    await sleep(POLL_INTERVAL);
  };

  const clearEditor = async (root) => {
    const writable = getWritableElement(root);
    writable.focus();

    if ("value" in writable) {
      setNativeValue(writable, "");
    } else {
      writable.textContent = "";
      dispatchInputEvents(writable, "", "deleteContentBackward");
    }

    writable.blur();
    await sleep(POLL_INTERVAL);
  };

  const ensureDrawerOpen = async () => {
    const existingEditor = findEditorRoot();
    if (existingEditor) return existingEditor;

    const importButton = await waitFor(
      () => findVisibleButton("导入商品"),
      "找到“导入商品”按钮",
    );
    importButton.click();

    return waitFor(() => findEditorRoot(), "导入商品抽屉打开并出现 URL 输入区");
  };

  const findEnabledRecognizeButton = () => {
    const button = findVisibleButton("识别链接");
    return button && !button.disabled && button.getAttribute("aria-disabled") !== "true"
      ? button
      : null;
  };

  const prepareBatch = async (batch, batchNumber) => {
    const batchText = batch.join("\n");
    let lastError;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const editor = await ensureDrawerOpen();
        await clearEditor(editor);
        await writeEditor(editor, batchText);

        const button = await waitFor(
          () => findEnabledRecognizeButton(),
          `第 ${batchNumber} 批的“识别链接”按钮解除禁用`,
        );

        return button;
      } catch (error) {
        lastError = error;
        if (attempt < 2) {
          const editor = findEditorRoot();
          if (editor) await clearEditor(editor);
          await sleep(1_000);
        }
      }
    }

    throw lastError;
  };

  const cleanedUrls = [
    ...new Set(urls.map((url) => normalizeText(url)).filter(Boolean)),
  ];

  if (!cleanedUrls.length) {
    throw new Error("urls 数组为空，请先在脚本顶部填入商品链接。");
  }

  const batches = [];
  for (let index = 0; index < cleanedUrls.length; index += BATCH_SIZE) {
    batches.push(cleanedUrls.slice(index, index + BATCH_SIZE));
  }

  for (let index = 0; index < batches.length; index += 1) {
    const batchNumber = index + 1;
    const batch = batches[index];

    try {
      const recognizeButton = await prepareBatch(batch, batchNumber);
      recognizeButton.click();

      // Avoid treating the editor's pre-submit state as an immediate completion.
      await sleep(POST_CLICK_SETTLE_DELAY);
      await waitFor(() => {
        const editor = findEditorRoot();
        return editor && readEditorText(editor) === "" ? editor : null;
      }, `第 ${batchNumber} 批识别完成后输入区清空`);

    } catch (error) {
    }
  }
})();