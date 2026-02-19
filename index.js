/*
 * Pegboard app
 * ----------------
 * This script implements an interactive pegboard editor that allows users
 * to paint squares with a limited set of colors and associated symbols.
 * The UI consists of a grid of squares (the pegboard), a symbol library,
 * and a key mapping that ties a color to a symbol. Users can click and
 * drag to paint squares; pegboards are persisted to localStorage.
 *
 * Structure and responsibilities:
 * - Configuration tables: `colorTable` and `symbolTable` define palettes.
 * - DOM references: cached selectors for the pegboard, key, and controls.
 * - App state: active selections and the currently edited pegboard record.
 * - Initialization: `initApp()` bootstraps UI and loads/save state.
 * - Event handlers: mouse interactions, file import/export, UI controls.
 * - Storage helpers: create/load/save pegboard records to localStorage.
 * - Render helpers: draw the grid and update the symbol/key UI.
 *
 * Note: Pegboard squares are stored in `record.squares` as an object where
 * keys are numeric indices (0..N-1) and values are objects { colorIndex, symbolIndex }.
 */

(function Pegboard() {

  // static config values
  const APP_STORAGE_KEY = 'pegboard';
  const DEFAULT_PEGBOARD_ID =  1;

  // Ordered list of colors used by the app. The index in this array is
  // treated as the canonical color id (colorIndex) used throughout saved
  // pegboard records and UI key mappings.
  const colorTable = [
    'white', 'red', 'yellow', 'green', 'blue'
  ];

  // List of symbols available in the symbol library. Each symbol is
  // represented as an HTML entity string. Index into this array is the
  // symbol id (symbolIndex) used in saved pegboard records.
  const symbolTable = [
     '&#9722;', '&#8679;',  '&#9672;', '&#9826;', '&#9873;',
     '&#9726;', '&#126;',   '&#35;',   '&#9711;', '&#61;',
     '&#33;',   '&#8258;',  '&#8251;', '&#8864;', '&#8896;',
     '&#9885;', '&#10047;', '&#8857;', '&#8709;', '&#9635;',
     '&#9547;', '&#9214;',  '&#8681;', '&#9680;', '&#9650;'
  ];

  // Pegboard and Key UI
  // DOM references: caching common elements to avoid repeated queries.
  // - `pegboard`: the grid container holding `.pegboard-square` cells.
  // - `pegboardContainer`: outer container used for view-mode classes.
  // - `pegboardKey`, `keySymbolSquares`, `keyColorSquares`: the small
  //   UI components that show color↔symbol mappings.
  // - `symbolLibrary`: the UI element that lists all available symbols.
  const pegboardAppContainer = document.querySelector('.pegboard-app');
  const pegboardContainer = document.querySelector('.pegboard-container');
  const pegboard = document.querySelector('.pegboard');
  const pegboardSquares = pegboard.querySelectorAll('.pegboard-square');
  const pegboardKey = document.querySelector('.key');
  const keySymbolSquares = pegboardKey.querySelectorAll('.key-symbol-square');
  const keyColorSquares = pegboardKey.querySelectorAll('.key-color-square');
  const symbolLibrary = document.getElementById('symbol-library');
  const symbolLibrarySymbols = symbolLibrary.getElementsByClassName('symbol');


  // Menu + Pegboard Controls  UI
  const loadButton = document.getElementById('load-button');
  const pegboardSelect = document.getElementById('pegboard-select')
  const pegboardNameInput = document.getElementById('pegboard-name-input');
  const resetAppDataButton = document.getElementById('reset-database');
  const newPegboardButton = document.getElementById('new-pegboard');
  const clearPegboardButton = document.getElementById('clear-pegboard');
  const copyPegboardButton = document.getElementById('copy-pegboard');
  const saveButton = document.getElementById('save-button');
  const exportButton = document.getElementById('download-link');
  const importButton = document.getElementById('import-button');
  const fileInput = document.getElementById('file-input');
  const viewModeSelector = document.querySelector('.view-mode-selector');


  // app state
  // Application runtime state. These variables track the user's current
  // selections and the pegboard being edited.
  // - `activeColorIndex`: the color slot currently selected in the key (index into colorTable)
  // - `activeKeySymbolIndex`: index of the key symbol currently active (matches color index)
  // - `activeSymbolLibraryIndex`: index of the active symbol in the symbol library
  // - `currentPegboard`: the in-memory pegboard record being edited (loaded from storage)
  // - `viewMode`: controls whether the UI displays colors or symbols primarily
  // - `mouseDown`: simple mouse-drag painting state flag
  let activeColorIndex = null;
  let activeKeySymbolIndex = null;
  let activeSymbolLibraryIndex = null;
  let currentPegboard = null;
  let viewMode = 'color'; // color | symbol
  let mouseDown = false;

  function buildKeyMap(symbols, colors) {

    // Create a bidirectional keyMap between symbol-library indices and
    // color indices. The `keyMap` has two properties:
    // - `s`: maps symbol-library-index -> color-index
    // - `c`: maps color-index -> symbol-library-index
    // This lets the app quickly find which symbol corresponds to a
    // particular color slot and vice versa.
    const keyMap = {
      s: {},
      c: {}
    };

    // Default symbol indices chosen from the symbolTable. These are
    // arbitrary but provide initial mappings when a new pegboard is created.
    const defaultSymbolLibraryIndices = [4,9,14,19, 24];

    for (let i = 0; i < colors.length; ++i) {

      const symbolLibraryIndex = defaultSymbolLibraryIndices[i];

      // map symbol index -> color index
      keyMap.s[symbolLibraryIndex] = i;
      // map color index -> symbol index
      keyMap.c[i] = symbolLibraryIndex;

    }

    return keyMap;

  }

  /*
   *
   * app initialization
   *
   */
  function initApp() {


    // Initialize application data and UI. This will:
    // - Load app data from localStorage (or create initial data)
    // - Set the currently active pegboard record
    // - Render the pegboard and initialize UI lists and key symbols/colors
    const appData = loadAppFromLocalStorage() || initStorage();
    currentPegboard = findLastTouched(appData);
    pegboardNameInput.value = currentPegboard.name;

    // Render the board and supporting UI components
    drawPegboard(currentPegboard);
    initPegboardSelect(appData, currentPegboard);
    initSymbolLibrary(symbolLibrary, symbolTable, colorTable, currentPegboard.keyMap);
    initKeyColors(keyColorSquares, currentPegboard.keyMap, colorTable);
    initKeySymbols(keySymbolSquares, currentPegboard.keyMap, symbolTable, colorTable);

    // Default the key selection to the first color
    setActiveKeyColor(0);

    // Apply the stored view mode (color or symbol)
    setViewMode(viewMode);

  }


  /*
   * pegboard selection ui logic
   *
   */

  function onMouseDown(e) {

    const isPegboardSquare = e.target.classList.contains('pegboard-square');

    if (!isPegboardSquare) {
      return;
    }

    // Start drawing/painting when the mouse goes down on a pegboard square.
    // `mouseDown` becomes true so `onMouseOver` will also paint when dragging.
    mouseDown = true;

    const element = e.target;
    const colorIndex = activeColorIndex;
    // Find which symbol is currently mapped to the active color
    const symbolIndex = currentPegboard.keyMap.c[activeColorIndex];

    // Determine numerical index of the clicked square among all squares.
    const squareIndex = [...pegboardSquares].indexOf(e.target);

    // If the square already has the same color/symbol, toggle it off.
    if (element.dataset.colorIndex == colorIndex &&
        element.dataset.symbolIndex == symbolIndex) {

      // clear DOM state
      delete element.dataset.colorIndex;
      delete element.dataset.color;
      delete element.dataset.symbolIndex;
      element.innerHTML = '';

      // remove from the saved model
      delete currentPegboard.squares[squareIndex];

    } else {

      // Apply the selected color/symbol to the DOM element
      element.dataset.colorIndex = colorIndex;
      element.dataset.color = colorTable[colorIndex];
      element.dataset.symbolIndex = symbolIndex;
      element.innerHTML = symbolTable[symbolIndex];

      // Persist the selection in the in-memory model for later saving
      currentPegboard.squares[squareIndex] = {
        colorIndex,
        symbolIndex
      };

    }


  }

  function onMouseOver(e) {

    const isPegboardSquare = e.target.classList.contains('pegboard-square');

    if (isPegboardSquare && mouseDown) {

      // While dragging with the mouse button down, paint squares using the
      // same logic as a single click: toggle off if same color/symbol, else set.
      const element = e.target;
      const colorIndex = activeColorIndex;
      const symbolIndex = currentPegboard.keyMap.c[activeColorIndex];
      const squareIndex = [...pegboardSquares].indexOf(e.target);

      // If the square already matches the selection, clear it (toggle off)
      if (element.dataset.colorIndex == colorIndex &&
          element.dataset.symbolIndex == symbolIndex) {

        delete element.dataset.colorIndex;
        delete element.dataset.color;
        delete element.dataset.symbolIndex;
        element.innerHTML = '';

        // remove from saved model
        delete currentPegboard.squares[squareIndex];

      } else {
        // otherwise set the new color/symbol in DOM and model
        element.dataset.colorIndex = colorIndex;
        element.dataset.color = colorTable[colorIndex];
        element.dataset.symbolIndex = symbolIndex;
        element.innerHTML = symbolTable[symbolIndex];

        currentPegboard.squares[squareIndex] = {
          colorIndex,
          symbolIndex
        };

      }

    }

  }


  function onMouseUp(e) {

    if (mouseDown) {

      savePegboard(currentPegboard);
      mouseDown = false;

    }

  }

  /*
   * data import / export
   */
  async function onFileSelect(e) {

    // Handler used when the file input changes (user selects a file to import).
    // The code reads the first file as text, parses it as JSON, validates the
    // structure and then imports the pegboard database into localStorage.
    fileInput.click()

    const file = fileInput.files[0];

    if (!file) return;

    const json = await file.text();
    const importedData = JSON.parse(json);
    const { result, msg } = validatePegboardData(importedData)

    if (!validatePegboardData(importedData)) {
      throw new Error('invalid import data!');
    }

    importPegboardDatabase(importedData);

  }

  function onExport(e) {
    const exportData = {
      [APP_STORAGE_KEY]: loadAppFromLocalStorage()
    };
    const blob = new Blob(
      [JSON.stringify(exportData, null, 2)],
      { content: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    e.target.href=url;
  }

  // Trigger the hidden file input so the user may pick a file to import.
  function onImport(e) {
    fileInput.click();
  }

  function validatePegboardData(data) {

    const hasAppKey = APP_STORAGE_KEY in data;
    const hasPegboardIndexKeys = Object.keys(data[APP_STORAGE_KEY])
      .map(k => parseInt(k))
      .every(n => !Number.isNaN(n));

    const hasProperRecords = Object.values(data[APP_STORAGE_KEY]).every(record => {
      return 'id' in record
          && 'name' in record
          && 'timestamp' in record
          && 'squares' in record;
    });

    // Return a simple result object describing validity and a short message
    if (!hasAppKey) return { result: false, msg: 'no app key' }
    if (!hasPegboardIndexKeys) return { result: false, msg: 'bad index keys' }
    if (!hasProperRecords) return { result: false, msg:  'bad records' }

    return { result: true };

  }

  function onSave() {
    createPdf(currentPegboard.name);
  }

  function createPdf(name) {

    // Produce a two-page PDF: one showing the color view and one showing
    // the symbol view. We clone the pegboard container twice, force the
    // appropriate view-mode classes, append them into a temporary container
    // and pass that to html2pdf for conversion.
    const colorClone = pegboardContainer.cloneNode(true);

    // Ensure this clone renders the color view
    colorClone.classList.remove('symbol-mode');
    colorClone.classList.add('color-mode');
    colorClone.classList.add('html2pdf__page-break');

    const symbolClone = pegboardContainer.cloneNode(true);

    // Ensure this clone renders the symbol-only view
    symbolClone.classList.remove('color-mode');
    symbolClone.classList.add('symbol-mode');
    symbolClone.classList.add('html2pdf__page-break');

    const container = document.createElement('div');
    container.classList.add('print-container');
    container.appendChild(colorClone);
    container.appendChild(symbolClone);

    // Delegate to the html2pdf library to generate the actual PDF file.
    const pdf = html2pdf(container, {
      filename: `${name}.pdf`,
      image: { type: 'jpeg', quality: 1 },
      html2canvas: { scale: 4 },
      pagebreak: {
        mode: 'legacy'
      }
    });

  }


  /*
   * Storage Functions
   */

  function PegboardRecord({
    id=1,
    name='new pegboard',
    squares={},
    timestamp=Date.now(),
    keyMap=buildKeyMap(symbolTable, colorTable)
  }) {

    // Factory for a pegboard record object. Records mirror what is stored
    // in localStorage and include:
    // - `id`: numeric identifier
    // - `name`: user-friendly name
    // - `squares`: object mapping squareIndex -> { colorIndex, symbolIndex }
    // - `keyMap`: the bidirectional mapping between symbols and colors
    return {
      id,
      name,
      squares,
      keyMap
    };

  }

  function findLastTouched(appData) {

    // Given the appData object (map of id->record) return the most recently
    // touched/modified pegboard record. If there's only one record return it.
    const records = Object.values(appData);
    if (records.length === 1) {
      return records[0];
    } else {
      return records.sort((e1, e2) => e2.timestamp - e1.timestamp)[0]
    }

  }

  function resetAppData() {

    // Clear saved data and re-initialize the app (will recreate default pegboard)
    localStorage.removeItem('pegboard');

    initApp();

  }

  function initStorage() {

    // Called when no data exists in localStorage. Create an initial
    // pegboard record and persist it using savePegboard. Returns the
    // resulting stored app data structure.
    const record = PegboardRecord({
      id: DEFAULT_PEGBOARD_ID,
      name: 'new pegboard',
      squares: {},
    })

    return savePegboard(record);

  }

  function loadAppFromLocalStorage() {

    // Load the raw JSON payload from localStorage and parse it into an
    // object mapping pegboardId -> PegboardRecord. Returns `null` if no
    // data is stored.
    const payload = localStorage.getItem(APP_STORAGE_KEY);
    const appData = JSON.parse(payload);

    return appData;

  }

  function importPegboardDatabase(data) {

    // Overwrite localStorage with the imported app data and re-init.
    localStorage.setItem(
      APP_STORAGE_KEY,
      JSON.stringify(data[APP_STORAGE_KEY])
    );

    initApp();

  }

  function loadPegboardById(pegboardId) {

    // Return a single pegboard record by id from stored app data.
    const appData = loadAppFromLocalStorage();
    const newPegboard = appData[pegboardId];

    return newPegboard;

  }

  function loadAllPegboards() {
    return loadAppFromLocalStorage();
  }

  function savePegboard(pegboardRecord) {
    console.log('save');

    // Persist a pegboard record into localStorage. The storage shape is a
    // mapping from pegboard id -> pegboard record. We update the record's
    // timestamp and either create a new storage object or merge into the
    // existing one.
    pegboardRecord.timestamp = Date.now();
    const currentAppData = loadAppFromLocalStorage();
    let newAppData;

    // nothing saved for this app yet, create entire app data structure
    if (!currentAppData) {
      newAppData = {
        [pegboardRecord.id]: pegboardRecord
      }
    } else {
      // previously stored data. update or insert the record.
      newAppData = currentAppData;
      newAppData[pegboardRecord.id] = pegboardRecord;
    }

    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(newAppData));

    // Return the full app data structure we just wrote (parsed from storage)
    return JSON.parse(localStorage.getItem(APP_STORAGE_KEY));

  }

  /*
   *
   * App Render Functions
   *
   */

  function initKeyColors(keyColorSquares, keyMap, colorTable) {

    // For each color in the palette, add a class to the corresponding
    // key color square so CSS can visually represent that color.
    colorTable.forEach((color, index) => {
      keyColorSquares[index].classList.add(colorTable[index]);
    });

  }

  function initKeySymbols(keySymbolSquares, keyMap, symbolTable, colorTable) {

    // Populate the small symbol squares in the key area so they reflect the
    // currently mapped symbol for each color slot. Each key symbol element
    // has an id like `symbol-0`..`symbol-4`; we use that to look up the
    // associated symbol index from keyMap.c and render the symbol markup.
    keySymbolSquares.forEach((square, index) => {
      const keyItemNumber = /symbol-(.*)/.exec(square.id)?.[1]; // same as color index
      const symbolIndex = keyMap.c[keyItemNumber];
      square.dataset.symbolIndex = symbolIndex;
      square.innerHTML = symbolTable[symbolIndex];
    });

  }

  function initSymbolLibrary(parentEl, symbolTable, colorTable, keyMap) {

    const symbolGridMarkup = symbolTable.map((symbol, index) => {

      const active = index in keyMap.s;

      return `
        <li
          class="symbol ${active ? 'selected' : ''}"
          data-symbol="${symbol}"
          data-symbol-index="${index}"
        >${symbol}</li>
      `;

    }).join('');

    // Replace the contents of the symbol library with the generated grid
    // markup. Items that are part of the keyMap are marked as `selected`.
    removeChildren(parentEl);
    parentEl.insertAdjacentHTML('beforeend', symbolGridMarkup);

  }

  // set squares based on record
  function drawPegboard(record) {

    const keyMap = record.keyMap;
    // Render each cell according to the `record.squares` mapping. Because
    // `record.squares` is an object rather than an array, we use the DOM
    // node order (index) to probe the saved data at that index key.
    const squares = [...pegboardSquares];

    squares.forEach((el, index) => {

      // Square data may be undefined if the square has not been painted.
      const squareData = record.squares[index];

      if (squareData) {

        const { symbolIndex, colorIndex } = squareData;

        // Rehydrate DOM dataset attributes so CSS and other code can
        // reflect the saved color and symbol state.
        el.dataset.symbolIndex = symbolIndex;
        el.dataset.colorIndex = colorIndex;
        el.dataset.color = colorTable[colorIndex];
        el.innerHTML = symbolIndex == null ? '' : symbolTable[symbolIndex];

      } else {
        // Empty/reset the DOM cell
        el.dataset.symbolIndex = '';
        el.dataset.colorIndex = '';
        el.dataset.color = '';
        el.innerHTML = '';
      }
    });

  }


  function onViewModeChange(e) {

    // Ensure the change event came from the view-mode radio inputs and update
    // the UI mode accordingly.
    if (!e.target.name === 'pegboard-mode-selector') {
      return;
    }

    setViewMode(e.target.value);

  }

  function setViewMode(mode) {

    viewMode = mode;


    // Toggle container classes used by CSS to switch presentation between
    // color-centric and symbol-centric views. Also update the radio inputs.
    pegboardContainer.classList.toggle('color-mode', mode === 'color');
    pegboardContainer.classList.toggle('symbol-mode', mode === 'symbol');

    viewModeSelector.querySelectorAll('input').forEach(el => {
      el.checked = el.value === mode;
    });


  }


  function populatePegboardList(ids) {
    const listMarkup = ids.map(id => `
      <li>${id}</li>
    `);

    removeChildren(pegboardList);
    pegboardList.insertAdjacentHTML('beforeend', listMarkup);
  }

  function onSymbolLibraryClick(e) {

    const symbolSquare = e.target;

    if (!symbolSquare.classList.contains('symbol')) {
      return;
    }

    // ignore clicks on active symbol library square
    if (symbolSquare.classList.contains('selected')) {
      return;
    }


    const symbolSquares = [...symbolLibrarySymbols];
    const newActiveSymbolLibraryIndex = symbolSquares.indexOf(symbolSquare);
    const oldActiveSymbolLibraryIndex = activeSymbolLibraryIndex;

    // Update the UI selection in the symbol library, and then update the
    // keyMap so the active color slot maps to the newly selected symbol.
    // We must also update any existing squares whose symbolIndex matches
    // the previous symbol-library index so that they reflect this change.
    // (This lets users swap symbols while preserving colored squares.)
    // remove existing active/selected item
    symbolSquares[oldActiveSymbolLibraryIndex].classList.remove('selected');
    symbolSquares[oldActiveSymbolLibraryIndex].classList.remove('active');

    // light up new active/selected.
    symbolSquares[newActiveSymbolLibraryIndex].classList.add('selected');
    symbolSquares[newActiveSymbolLibraryIndex].classList.add('active');

    // update keymap bidirectional color-symbol connection
    delete currentPegboard.keyMap.s[oldActiveSymbolLibraryIndex];
    currentPegboard.keyMap.c[activeKeySymbolIndex] = newActiveSymbolLibraryIndex;
    currentPegboard.keyMap.s[newActiveSymbolLibraryIndex] = activeKeySymbolIndex;

    // Update any painted squares that referenced the old symbol index so
    // that they now point to the new symbol index. This keeps visual
    // consistency when the user remaps symbols.
    Object.keys(currentPegboard.squares).forEach(squareIndexKey => {
      if (!currentPegboard.squares[squareIndexKey]) {
        return;
      }
      if (oldActiveSymbolLibraryIndex == currentPegboard.squares[squareIndexKey].symbolIndex) {
        currentPegboard.squares[squareIndexKey].symbolIndex = newActiveSymbolLibraryIndex;
      }

    });
    // Persist the change
    savePegboard(currentPegboard);

    // Refresh UI elements that depend on the keyMap and the pegboard state
    initKeyColors(keyColorSquares, currentPegboard.keyMap, colorTable);
    initKeySymbols(keySymbolSquares, currentPegboard.keyMap, symbolTable, colorTable);

    // Rerender the pegboard to show any changed symbols
    drawPegboard(currentPegboard);

    // update active symbol library index
    activeSymbolLibraryIndex = newActiveSymbolLibraryIndex;

  }

  function onKeyClick(e) {

    // ux: when we click on a color, activate associated symbol square in the key
    // and in the symbol library.
    //
    // deactivate any other color/symbol pairs.

    // When a color square in the key is clicked, make that the active
    // color. The UI will highlight the associated symbol and color and
    // subsequent painting will use that color/symbol.
    if (!e.target.classList.contains('key-color-square')) {
      return;
    }

    const keyItemIndex = /color-(.*)/.exec(e.target.id)?.[1];

    // update ui w/ new selection
    setActiveKeyColor(keyItemIndex);

  }

  // when a color palette item is clicked, highlight associated symbol
  // and set to active color in key and symbol library
  function setActiveKeyColor(colorIndex) {

    // Update UI to indicate the currently selected color and its
    // associated symbol. We also update global state variables that
    // other handlers use when painting the board.
    const colorSquare = document.getElementById(`color-${colorIndex}`);
    const keySymbolEl = document.getElementById(`symbol-${colorIndex}`);
    const indexInSymbolLibrary = keySymbolEl.dataset.symbolIndex;

    // deactivate old symbol (if any)
    if (activeKeySymbolIndex != null) {
      const prevKeySymbolEl = document.getElementById(`symbol-${activeKeySymbolIndex}`);
      prevKeySymbolEl.classList.remove('active');
      symbolLibrary.children[prevKeySymbolEl.dataset.symbolIndex].classList.remove('active');
    } 

    // activate new symbol in both the key and the symbol library
    keySymbolEl.classList.add('active');
    symbolLibrary.children[keySymbolEl.dataset.symbolIndex].classList.add('active');

    // deactivate old color
    if (activeColorIndex != null) {
      document.getElementById(`color-${activeColorIndex}`).classList.remove('active');
    }

    // activate new color
    colorSquare.classList.add('active');

    // update global state used by painting handlers
    activeColorIndex = colorIndex;
    activeKeySymbolIndex = colorIndex;
    activeSymbolLibraryIndex = indexInSymbolLibrary;
  }

  function onPegboardNameChange(e) {
    changePegboardName(currentPegboard, e.target.value);
  }

  function changePegboardName(currentPegboard, newName) {

    // Update the in-memory name, persist it, and refresh the pegboard
    // selection dropdown so the new name appears there.
    currentPegboard.name = newName;
    savePegboard(currentPegboard);

    const allPegboards = loadAllPegboards();

    initPegboardSelect(allPegboards, currentPegboard);

  }


  function onPegboardSelectChange(e) {

    switchPegboard(e.target.value);

  }


  function switchPegboard(pegboardId) {

    // Load a different pegboard record by id and render it into the UI.
    currentPegboard = loadPegboardById(pegboardId)
    drawPegboard(currentPegboard);
    pegboardNameInput.value = currentPegboard.name;

  }

  function initPegboardSelect(pegboards, currentPegboard) {

    // Populate the `<select>` element with available pegboards. The
    // currently active pegboard is marked as selected.
    const options = Object.entries(pegboards).map(([id, pegboard]) => {

      const selected = pegboard.name === currentPegboard.name;
      return `<option ${ selected ? 'selected' : '' } value="${id}">${pegboard.name}</option>`;

    }).join('');

    removeChildren(pegboardSelect)
    pegboardSelect.insertAdjacentHTML('beforeend', options);

  }

  function copyPegboard() {

    const pegboards = loadAllPegboards();
    const sortedKeys = Object.keys(pegboards).map(k => parseInt(k)).sort()
    const latestRecord = sortedKeys.slice(-1)[0];

    // Create a shallow copy of the current pegboard as a new record with
    // a new id and save it. Note: `squares` is copied by reference here
    // which means subsequent changes to one will affect the other; if
    // independent copies are desired perform a deep copy.
    const newPegboardRecord = PegboardRecord({
      id: latestRecord + 1,
      name: `${currentPegboard.name} copy`,
      squares: currentPegboard.squares
    });

    savePegboard(newPegboardRecord);

    initApp();
  }

  function clearPegboard() {

    // Clear all painted squares on the current pegboard and persist the
    // change. We replace `squares` with an empty object and re-init UI.
    currentPegboard.squares = {};
    savePegboard(currentPegboard);

    initApp();

  }

  function createNewPegboard() {

    const pegboards = loadAllPegboards();
    const sortedKeys = Object.keys(pegboards).map(k => parseInt(k)).sort()
    const latestRecord = sortedKeys.slice(-1)[0];

    // Create and insert a fresh pegboard record into storage and then
    // set it as the current pegboard in the UI.
    const newPegboardRecord = PegboardRecord({
      id: latestRecord + 1,
      name: 'new pegboard'
    });
    const appData = savePegboard(newPegboardRecord);

    currentPegboard = appData[newPegboardRecord.id];

    initPegboardSelect(appData, currentPegboard);
    pegboardNameInput.value = currentPegboard.name;
    drawPegboard(currentPegboard);

  }

  /*
   * utils
   *
   */

  function removeChildren(node) {
    // Utility: remove all child nodes from a DOM node.
    while (node.lastChild) {
      node.removeChild(node.lastChild);
    }
  }

  /*
   * bind events
   *
   */

  pegboardKey.addEventListener('click', onKeyClick);
  symbolLibrary.addEventListener('click', onSymbolLibraryClick);
  pegboardNameInput.addEventListener('change', onPegboardNameChange);
  pegboardSelect.addEventListener('change', onPegboardSelectChange);
  viewModeSelector.addEventListener('change', onViewModeChange);
  saveButton.addEventListener('click', onSave);
  exportButton.addEventListener('click', onExport);
  importButton.addEventListener('click', onImport);
  fileInput.addEventListener('change', onFileSelect);
  pegboard.addEventListener('mousedown', onMouseDown);
  document.body.addEventListener('mouseover', onMouseOver);
  document.body.addEventListener('mouseup', onMouseUp);

  newPegboardButton.addEventListener('click', createNewPegboard);
  clearPegboardButton.addEventListener('click', clearPegboard);
  resetAppDataButton.addEventListener('click', resetAppData);
  copyPegboardButton.addEventListener('click', copyPegboard);

  // Bindings established — finally bootstrap the app state and render UI
  initApp();

})();
