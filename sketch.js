// ========================================
// p5.js Google 試算表 CSV 選擇題測驗
// ========================================

// 請把「請替換成你的試算表ID」替換成老師自己的 Google 試算表 ID。
// 試算表必須設定為「知道連結的任何人都能查看」，並使用固定欄位發布為 CSV。
// 範例格式： https://docs.google.com/spreadsheets/d/你的試算表ID/export?format=csv&gid=0
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS9qWozcm7hPKyxqYEGJI_ZZaZgsdtMdHmY8uuVWI-PwqHQPS6mIZRjc62QeWF013kuMabj5KXc5RLg/pub?gid=1857494319&single=true&output=csv";

// Google 試算表第一列必須完全使用這六個欄位，answer 使用 1 到 4。
const REQUIRED_COLUMNS = ["question", "option1", "option2", "option3", "option4", "answer"];

// 每次測驗固定抽出五題。
const QUIZ_SIZE = 5;

// 設定 Google Fonts 名稱，繪製文字時依字元切換字型。
const CHINESE_FONT = "LXGW WenKai Mono TC";
const LATIN_FONT = "Bitcount Ink";

// 記錄目前頁面：loading、error、quiz 或 result。
let appState = "loading";

// 儲存驗證後的完整題庫與本次抽出的五題。
let questionBank = [];
let quizQuestions = [];

// 儲存作答進度與分數。
let currentQuestion = 0;
let score = 0;
let selectedAnswer = -1;
let answered = false;

// 儲存錯誤畫面的訊息。
let errorMessage = "";

// 儲存滑鼠判定用的選項與按鈕位置。
let optionBoxes = [];
let nextButton = { x: 0, y: 0, w: 190, h: 54 };
let restartButton = { x: 0, y: 0, w: 210, h: 54 };
let reloadButton = { x: 0, y: 0, w: 210, h: 54 };

// p5.js 啟動時執行一次。
function setup() {
  // 建立符合瀏覽器視窗大小的全螢幕畫布。
  createCanvas(windowWidth, windowHeight);

  // 設定繪圖模式與預設文字對齊方式。
  rectMode(CORNER);
  textAlign(CENTER, CENTER);
  textFont(CHINESE_FONT);

  // 啟動時讀取線上 Google 試算表題庫。
  startQuizLoading();
}

// p5.js 每一幀持續執行。
function draw() {
  // 繪製整體背景。
  background("#f5f7fa");

  // 依狀態顯示載入中、錯誤、作答或結果畫面。
  if (appState === "loading") {
    drawLoadingPage();
  } else if (appState === "error") {
    drawErrorPage();
  } else if (appState === "result") {
    drawResultPage();
  } else {
    drawQuizPage();
  }
}

// 開始或重新開始讀取 Google 試算表。
function startQuizLoading() {
  // 重設畫面與作答資料，避免重新測驗沿用舊題目。
  appState = "loading";
  errorMessage = "";
  questionBank = [];
  quizQuestions = [];
  optionBoxes = [];
  currentQuestion = 0;
  score = 0;
  selectedAnswer = -1;
  answered = false;

  // 加入時間戳記，讓重新測驗取得老師最新修改的 CSV。
  const cacheBustedUrl = addCacheBuster(GOOGLE_SHEET_CSV_URL);

  // 使用指定的 loadTable(..., 'csv', 'header', 成功回呼, 失敗回呼) 讀取線上題庫。
  loadTable(cacheBustedUrl, "csv", "header", handleTableLoaded, handleTableLoadError);
}

// 在網址後加入 cache busting 參數，避免瀏覽器使用舊資料。
function addCacheBuster(url) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}_cacheBust=${Date.now()}`;
}

// Google 試算表成功讀取後的回呼函式。
function handleTableLoaded(table) {
  try {
    // 先確認欄位名稱、數量與順序完全正確。
    const columnNames = validateColumns(table);

    // 逐列讀取並驗證題目內容。
    const validQuestions = parseAndValidateRows(table, columnNames);

    // 題庫至少要有五個有效且不重複的題目。
    if (validQuestions.length < QUIZ_SIZE) {
      throw new Error(`有效且不重複的題目只有 ${validQuestions.length} 題，至少需要 ${QUIZ_SIZE} 題。`);
    }

    // 儲存題庫並以不重複抽樣方式取得五題。
    questionBank = validQuestions;
    quizQuestions = pickRandomQuestions(questionBank, QUIZ_SIZE);
    currentQuestion = 0;
    score = 0;
    selectedAnswer = -1;
    answered = false;
    appState = "quiz";
  } catch (error) {
    // 將欄位錯誤、資料錯誤或題目不足轉為錯誤畫面。
    handleTableLoadError(error);
  }
}

// 驗證 CSV 欄位，並回傳原始欄位名稱對照表。
function validateColumns(table) {
  // p5.Table.columns 是 CSV 第一列的欄位名稱。
  const rawColumns = Array.isArray(table.columns) ? table.columns : [];
  const normalizedColumns = rawColumns.map(normalizeColumnName);

  // 欄位不可重複，否則無法判斷要讀取哪一欄。
  if (new Set(normalizedColumns).size !== normalizedColumns.length) {
    throw new Error("CSV 欄位名稱不可重複，請確認第一列只有固定的六個欄位。");
  }

  // 固定格式要求欄位數量、名稱與順序都正確。
  const sameFormat = normalizedColumns.length === REQUIRED_COLUMNS.length &&
    REQUIRED_COLUMNS.every((name, index) => normalizedColumns[index] === name);

  if (!sameFormat) {
    throw new Error("欄位格式錯誤。第一列必須完全使用：question,option1,option2,option3,option4,answer");
  }

  // 建立標準欄位名稱到 p5.Table 原始欄位名稱的對照。
  const columnNames = {};
  REQUIRED_COLUMNS.forEach((name, index) => {
    columnNames[name] = rawColumns[index];
  });
  return columnNames;
}

// 正規化欄位名稱，處理 UTF-8 BOM 與前後空白。
function normalizeColumnName(value) {
  return String(value).replace(/^\uFEFF/, "").trim().toLowerCase();
}

// 讀取並驗證 CSV 的每一列題目。
function parseAndValidateRows(table, columnNames) {
  const rows = table.getRows();
  const seenQuestions = new Set();
  const validQuestions = [];

  // 逐列檢查六個固定欄位。
  rows.forEach((row, rowIndex) => {
    const values = {};
    REQUIRED_COLUMNS.forEach((column) => {
      values[column] = String(row.getString(columnNames[column]) || "").trim();
    });

    // 空白列直接略過，方便老師在試算表底部保留空列。
    if (REQUIRED_COLUMNS.every((column) => values[column] === "")) {
      return;
    }

    // 題目、四個選項與 answer 都不可為空白。
    const missingColumns = REQUIRED_COLUMNS.filter((column) => values[column] === "");
    if (missingColumns.length > 0) {
      throw new Error(`第 ${rowIndex + 2} 列缺少資料：${missingColumns.join(", ")}。`);
    }

    // answer 必須是 1、2、3 或 4，程式內再轉成 0 到 3 的索引值。
    if (!/^[1-4]$/.test(values.answer)) {
      throw new Error(`第 ${rowIndex + 2} 列的 answer 必須是 1、2、3 或 4。`);
    }

    // 重複題目不納入有效題數，確保抽題不重複。
    const questionKey = values.question.replace(/\s+/g, " ");
    if (seenQuestions.has(questionKey)) {
      return;
    }
    seenQuestions.add(questionKey);

    // 將 CSV 一列轉成畫面使用的題目物件。
    validQuestions.push({
      question: values.question,
      options: [values.option1, values.option2, values.option3, values.option4],
      answer: Number(values.answer) - 1
    });
  });

  return validQuestions;
}

// 以 Fisher-Yates 洗牌，從題庫不重複抽出指定數量的題目。
function pickRandomQuestions(source, count) {
  const shuffled = source.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = floor(random(index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled.slice(0, count);
}

// Google 試算表讀取失敗時的回呼函式。
function handleTableLoadError(error) {
  appState = "error";
  questionBank = [];
  quizQuestions = [];
  const detail = error && error.message ? error.message : "無法讀取 Google 試算表 CSV。";
  errorMessage = detail;
}

// 繪製載入中畫面。
function drawLoadingPage() {
  drawMixedText("p5.js 程式設計小測驗", width / 2, height * 0.35, width - 40, 42, 32, "#023047");
  const dots = ".".repeat(frameCount % 4);
  drawMixedText(`正在從 Google 試算表載入題庫${dots}`, width / 2, height * 0.48, width - 50, 30, 21, "#555555");
  drawMixedText("請稍候，正在取得老師最新編輯的題目", width / 2, height * 0.57, width - 50, 28, 17, "#777777");
}

// 繪製讀取失敗、欄位錯誤或題目不足畫面。
function drawErrorPage() {
  drawMixedText("題庫載入失敗", width / 2, height * 0.22, width - 40, 42, 32, "#9b2226");
  drawMixedText(errorMessage, width / 2, height * 0.37, min(width - 48, 760), 28, 18, "#333333");
  const hint = "請確認試算表已公開發布為 CSV，欄位為 question,option1,option2,option3,option4,answer，且至少有五題。";
  drawMixedText(hint, width / 2, height * 0.57, min(width - 48, 760), 27, 16, "#666666");

  // 錯誤畫面提供重新讀取按鈕。
  reloadButton.x = width / 2 - reloadButton.w / 2;
  reloadButton.y = min(height - 86, height * 0.72);
  drawButton(reloadButton, "重新載入題庫", "#9b2226");
}

// 繪製測驗題目與四個選項。
function drawQuizPage() {
  const data = quizQuestions[currentQuestion];
  if (!data) {
    appState = "loading";
    return;
  }

  const layout = getQuizLayout();

  // 顯示標題與題數。
  drawMixedText("p5.js 程式設計小測驗", width / 2, layout.titleY, width - 40, 40, layout.titleSize, "#023047");
  drawMixedText(`第 ${currentQuestion + 1} 題／共 ${quizQuestions.length} 題`, width / 2, layout.progressY, width - 40, 28, layout.progressSize, "#555555");

  // 繪製題目卡片。
  fill("#ffffff");
  stroke("#bde0fe");
  strokeWeight(2);
  rect(layout.cardX, layout.cardY, layout.cardWidth, layout.cardHeight, 15);
  drawMixedText(data.question, width / 2, layout.cardY + layout.cardHeight / 2, layout.cardWidth - 36, layout.questionLineHeight, layout.questionSize, "#222222");

  // 每一幀重新記錄四個選項的實際位置。
  optionBoxes = [];
  data.options.forEach((option, index) => {
    let optionY = layout.optionStartY + index * (layout.optionHeight + layout.optionGap);

    // 答錯時讓正確選項上下跳動。
    if (answered && selectedAnswer !== data.answer && index === data.answer) {
      optionY += sin(frameCount * 0.12) * 8;
    }

    optionBoxes.push({ x: layout.optionX, y: optionY, w: layout.optionWidth, h: layout.optionHeight });

    // 答錯的正確選項使用指定 #caf0f8 背景色。
    let optionColor = "#ffffff";
    if (answered && index === data.answer) {
      optionColor = "#caf0f8";
    }
    if (answered && index === selectedAnswer && selectedAnswer !== data.answer) {
      optionColor = "#ffccd5";
    }
    if (answered && index === selectedAnswer && selectedAnswer === data.answer) {
      optionColor = "#c7f9cc";
    }

    // 繪製選項卡片與混合字型文字。
    fill(optionColor);
    stroke("#8ecae6");
    strokeWeight(2);
    rect(layout.optionX, optionY, layout.optionWidth, layout.optionHeight, 12);
    drawMixedText(`${String.fromCharCode(65 + index)}. ${option}`, width / 2, optionY + layout.optionHeight / 2, layout.optionWidth - 28, layout.optionLineHeight, layout.optionSize, "#222222");
  });

  // 作答後顯示提示與下一題／查看結果按鈕。
  if (answered) {
    const feedback = selectedAnswer === data.answer ? "答對了！" : "答錯了，正確選項已使用 #caf0f8 標示並上下跳動。";
    drawMixedText(feedback, width / 2, layout.feedbackY, width - 40, 25, layout.feedbackSize, "#555555");
    nextButton.x = width / 2 - nextButton.w / 2;
    nextButton.y = layout.buttonY;
    drawButton(nextButton, currentQuestion === quizQuestions.length - 1 ? "查看結果" : "下一題", "#219ebc");
  }
}

// 依視窗大小計算版面，讓桌面與手機都能使用全螢幕畫布。
function getQuizLayout() {
  const contentWidth = min(width - 32, 900);
  const cardX = (width - contentWidth) / 2;
  const cardY = constrain(height * 0.16, 92, 142);
  const cardHeight = constrain(height * 0.17, 92, 124);
  const optionWidth = min(width - 32, 720);
  const optionX = (width - optionWidth) / 2;
  const optionStartY = cardY + cardHeight + 20;
  const bottomReserve = answered ? 105 : 24;
  const availableHeight = max(160, height - optionStartY - bottomReserve);
  const optionGap = constrain(availableHeight * 0.04, 8, 16);
  const optionHeight = constrain((availableHeight - optionGap * 3) / 4, 42, 62);

  return {
    titleY: constrain(height * 0.055, 30, 48),
    progressY: constrain(height * 0.105, 62, 86),
    titleSize: constrain(width * 0.045, 24, 34),
    progressSize: constrain(width * 0.025, 15, 19),
    cardX,
    cardY,
    cardWidth: contentWidth,
    cardHeight,
    questionSize: constrain(width * 0.029, 17, 24),
    questionLineHeight: constrain(width * 0.04, 24, 32),
    optionX,
    optionWidth,
    optionStartY,
    optionHeight,
    optionGap,
    optionSize: constrain(width * 0.025, 16, 20),
    optionLineHeight: constrain(width * 0.035, 22, 28),
    feedbackY: height - 102,
    feedbackSize: constrain(width * 0.022, 14, 18),
    buttonY: height - 72
  };
}

// 繪製測驗結果頁面。
function drawResultPage() {
  drawMixedText("測驗完成！", width / 2, height * 0.28, width - 40, 46, 36, "#023047");
  drawMixedText(`你答對了 ${score}／${quizQuestions.length} 題`, width / 2, height * 0.42, width - 40, 40, 30, "#219ebc");

  let encouragement = "再練習一下，你一定可以！";
  if (score === quizQuestions.length) {
    encouragement = "太棒了！全部答對！";
  } else if (score >= 3) {
    encouragement = "表現很好，繼續加油！";
  }
  drawMixedText(encouragement, width / 2, height * 0.53, width - 40, 30, 21, "#555555");

  // 重新測驗會重新讀取 Google 試算表，不使用舊題庫。
  restartButton.x = width / 2 - restartButton.w / 2;
  restartButton.y = min(height - 84, height * 0.65);
  drawButton(restartButton, "重新測驗", "#219ebc");
}

// 繪製圓角按鈕與按鈕文字。
function drawButton(button, label, color) {
  fill(color);
  noStroke();
  rect(button.x, button.y, button.w, button.h, 12);
  drawMixedText(label, button.x + button.w / 2, button.y + button.h / 2, button.w - 20, 26, 19, "#ffffff");
}

// 處理滑鼠點擊：錯誤重載、重新測驗、選項與下一題。
function mousePressed() {
  // 錯誤畫面按鈕會重新讀取線上題庫。
  if (appState === "error") {
    if (isInside(mouseX, mouseY, reloadButton)) {
      startQuizLoading();
    }
    return;
  }

  // 結果畫面按鈕會重新讀取 Google 試算表，以取得老師最新題目。
  if (appState === "result") {
    if (isInside(mouseX, mouseY, restartButton)) {
      startQuizLoading();
    }
    return;
  }

  // 載入中或沒有題目時不接受操作。
  if (appState !== "quiz" || !quizQuestions[currentQuestion]) {
    return;
  }

  // 尚未作答時，檢查是否點擊四個選項。
  if (!answered) {
    for (let index = 0; index < optionBoxes.length; index += 1) {
      if (isInside(mouseX, mouseY, optionBoxes[index])) {
        selectedAnswer = index;
        answered = true;
        if (selectedAnswer === quizQuestions[currentQuestion].answer) {
          score += 1;
        }
        return;
      }
    }
    return;
  }

  // 已作答後，檢查下一題／查看結果按鈕。
  if (!isInside(mouseX, mouseY, nextButton)) {
    return;
  }
  if (currentQuestion < quizQuestions.length - 1) {
    currentQuestion += 1;
    selectedAnswer = -1;
    answered = false;
  } else {
    appState = "result";
  }
}

// 判斷座標是否位於矩形範圍內。
function isInside(x, y, box) {
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
}

// 瀏覽器視窗大小改變時，重新調整全螢幕畫布。
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// 判斷字元是否為中文、中文標點或全形字元。
function isChineseCharacter(character) {
  return /[\u2e80-\u2fff\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(character);
}

// 根據字元種類選擇中文或英文／數字字型。
function fontForCharacter(character) {
  return isChineseCharacter(character) ? CHINESE_FONT : LATIN_FONT;
}

// 計算混合字型文字寬度。
function mixedTextWidth(value, size) {
  textSize(size);
  let totalWidth = 0;
  for (const character of String(value)) {
    textFont(fontForCharacter(character));
    totalWidth += textWidth(character);
  }
  return totalWidth;
}

// 將混合字型文字依寬度切成多行。
function wrapMixedText(value, maxWidth, size) {
  const lines = [];
  let currentLine = "";
  for (const character of String(value)) {
    if (character === "\n") {
      lines.push(currentLine);
      currentLine = "";
      continue;
    }
    const candidate = currentLine + character;
    if (currentLine !== "" && mixedTextWidth(candidate, size) > maxWidth) {
      lines.push(currentLine);
      currentLine = character;
    } else {
      currentLine = candidate;
    }
  }
  if (currentLine !== "" || lines.length === 0) {
    lines.push(currentLine);
  }
  return lines;
}

// 以中英文數字混合字型繪製置中文字。
function drawMixedText(value, centerX, centerY, maxWidth, lineHeight, size, color) {
  const lines = wrapMixedText(value, maxWidth, size);
  push();
  textSize(size);
  textAlign(LEFT, CENTER);
  fill(color);
  noStroke();

  const totalHeight = lines.length * lineHeight;
  let lineY = centerY - totalHeight / 2 + lineHeight / 2;
  lines.forEach((line) => {
    const lineWidth = mixedTextWidth(line, size);
    let characterX = centerX - lineWidth / 2;
    for (const character of line) {
      textFont(fontForCharacter(character));
      text(character, characterX, lineY);
      characterX += textWidth(character);
    }
    lineY += lineHeight;
  });
  pop();
}
