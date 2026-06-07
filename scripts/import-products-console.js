(async () => {
  const urls = [
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3818527619964600614&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3813507063041098220&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3816666906811826558&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3677501756599828872&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3818116059068760132&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3752094478891090213&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3815365336392401090&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3810348561070162418&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3812393083698544909&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3818679773316645017&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3755990914082931165&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3815591416944525780&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3811695651943743498&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3818700445120069860&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3818521699377348885&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3811660209865228452&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3753211679400394786&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3813505948304146740&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3753741882199507033&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3818114665301540972&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3818589555473383722&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3817229096648311230&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3811473471012208946&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3816116287826952381&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3758956118450242478&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3678266254378008718&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3753211801639190603&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3809020559338111045&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3815573017438847212&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3817963465113469267&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3758226394933494174&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3752093160344519308&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3818511193828622528&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3816999068836692010&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3818591885476364595&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3816300121017155606&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3760254122092265719&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3812371501622100442&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3817968271374811230&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3816102281963765929&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3818031967685968257&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3818744172131778904&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3799940521892380758&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3813507614927618996&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3807757991642530041&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3813506268287598769&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3815365297804804578&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3813511980778651684&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3818147218863554585&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3811630886076678379&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3815425150380277809&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3811631225152602606&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3816667856117039371&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3816661720689148399&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3816666533309055227&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3756018513408557105&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3758965107984564298&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3812373421396983859&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3756551269842551257&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3818015503121776985&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3749290614550823234&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3816666917708628155&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3818714755984654613&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3813529656733336034&origin_type=604',
    'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3817961364866073043&origin_type=604',
  ];

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