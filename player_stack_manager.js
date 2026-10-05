/*
 * Each player follows this structure:
 * {
 *   name: string,
 *   stack: number,
 *   total_chips: number
 * }
 */
class Player {
  constructor(name) {
    this.name = name;
    this.stack = 1; // Every new player starts with one buy-in.
    this.total_chips = 0;
  }

  static fromJSON(data) {
    const p = new Player(data.name);
    p.stack = data.stack;
    p.total_chips = data.total_chips;
    return p;
  }
}

let players = [];
let messages = [];
let undoStack = [];
let redoStack = [];

let chipsVisible = false;
let showAllMessages = false;
let restoringHistory = false;
let resetConfirm = false;
let confirmTimeoutSeconds = 3 // 3 seconds to confirm reset

const themeToggleButton = document.getElementById('themeToggleButton');

const tableBody = document.getElementById('playersTableBody');
const totalChipsHeader = document.getElementById('totalChipsHeader');
const toggleChipsButton = document.getElementById('toggleChipsButton');
const message = document.getElementById('message');

const toggleMessageButton = document.getElementById('toggleMessageButton');
const resetButton = document.getElementById('resetButton');
const undoButton = document.getElementById('undoButton');
const redoButton = document.getElementById('redoButton');

const playerAction = document.getElementById('playerAction');
const playerNameInput = document.getElementById('playerNameInput');
const removePlayerSelect = document.getElementById('removePlayerSelect');
const playerActionButton = document.getElementById('playerActionButton');

const borrowerSelect = document.getElementById('borrowerSelect');
const lenderSelect = document.getElementById('lenderSelect');
const borrowButton = document.getElementById('borrowButton');

/* Message (History) */
function renderMessages() {
  const visibleMessages = showAllMessages
    ? messages
    : messages.slice(-3); // Show only the last 3 messages when collapsed.

  message.innerHTML = '';

  visibleMessages.forEach(entry => {
    const messageItem = document.createElement('div');

    const time = entry.timestamp.toLocaleTimeString();
    messageItem.textContent = `[${time}] ${entry.text}`;
    messageItem.className = entry.isSuccess ? 'success' : '';
    message.appendChild(messageItem);
  });
}
function showMessage(text, isSuccess = false) {
  // Store every generated message, including its visual status.
  messages.push({
    text,
    isSuccess,
    timestamp: new Date()
  });

  // Keep only the last 100 messages to prevent infinite growth
  if (messages.length > 100) {
    messages.shift(); // Removes the oldest message
  }

  renderMessages();
}

function findPlayer(name) {
  return players.find(player => player.name === name);
}

function clonePlayers() {
  // Prevents history entries from sharing references with current players.
  return players.map(player => ({
    name: player.name,
    stack: player.stack,
    total_chips: player.total_chips
  }));
}

// LocalForage section
async function saveGameState() {
  try {
    await localforage.setItem('pokerGameState', {
      players: clonePlayers(),
      undoStack: undoStack,
      redoStack: redoStack,
      messages: messages
    });
  } catch (error) {
    console.error('Error saving game state:', error);
  }
}

async function loadGameState() {
  try {
    const savedState = await localforage.getItem('pokerGameState');
    if (!savedState) return; // No saved state found.

    players = (savedState.players || []).map(Player.fromJSON);
    undoStack = savedState.undoStack || [];
    redoStack = savedState.redoStack || [];
    messages = (savedState.messages || []).map(msg => ({
      text: msg.text,
      isSuccess: msg.isSuccess,
      timestamp: new Date(msg.timestamp)
    }));
  } catch (error) {
    console.error('Error loading game state:', error);
  }
}

async function resetGameState() {
  try {
    await localforage.removeItem('pokerGameState');
    players.length = 0;
    undoStack.length = 0;
    redoStack.length = 0;
    updateHistoryButtons();
    render();
  } catch (err) {
    console.error('Failed to clear state:', err);
  }
}

function saveStateForUndo() {
  if (restoringHistory) return;
  
  undoStack.push(clonePlayers());
  redoStack.length = 0; // Clear redo stack on new action
  updateHistoryButtons();
}

function restorePlayers(snapshot) {
  players.length = 0;

  snapshot.forEach(savedPlayer => {
    players.push(Player.fromJSON(savedPlayer));
  });

  render();
}

function undo() {
  if (undoStack.length === 0) {
    showMessage('There is nothing to undo.');
    return;
  }

  // Save the current state so it can be restored with redo.
  redoStack.push(clonePlayers());
  const previousState = undoStack.pop();

  restoringHistory = true;
  restorePlayers(previousState);
  restoringHistory = false;

  showMessage('Undid the last change.', true);
  updateHistoryButtons();
  saveGameState(); // Save the current state to localForage
}

function redo() {
  if (redoStack.length === 0) {
    showMessage('There is nothing to redo.');
    return;
  }

  // Save the current state so it can be undone again.
  undoStack.push(clonePlayers());
  const nextState = redoStack.pop();

  restoringHistory = true;
  restorePlayers(nextState);
  restoringHistory = false;

  showMessage('Redid the change.', true);
  updateHistoryButtons();
  saveGameState(); // Save the current state to localForage
}

function updateHistoryButtons() {
  undoButton.disabled = undoStack.length === 0;
  redoButton.disabled = redoStack.length === 0;
}

// Updates the player table based on the current players and chips visibility.
function renderTable() {
  tableBody.innerHTML = '';
  totalChipsHeader.classList.toggle('hidden', !chipsVisible);

  players.forEach(player => {
    const row = document.createElement('tr');

    const nameCell = document.createElement('td');
    nameCell.textContent = player.name;

    const stackCell = document.createElement('td');
    stackCell.textContent = player.stack;

    const chipsCell = document.createElement('td');
    chipsCell.classList.toggle('hidden', !chipsVisible);

    if (chipsVisible) {
      const chipsInput = document.createElement('input');
      chipsInput.className = 'chips-input';
      chipsInput.type = 'number';
      chipsInput.min = '0';
      chipsInput.step = '1';
      chipsInput.value = player.total_chips;
      chipsInput.setAttribute('aria-label', `total chips for ${player.name}`);

      // Save total_chips when the user leaves the field or presses Enter.
      chipsInput.addEventListener('change', () => {
        const value = Number(chipsInput.value);

        if (!Number.isInteger(value) || value < 0) {
          chipsInput.value = player.total_chips;
          showMessage('total chips must be a non-negative whole number.');
          return;
        }
        saveStateForUndo();
        player.total_chips = value;
        showMessage(`Updated total chips for ${player.name}.`, true);
        saveGameState(); // Save the current state to localForage
      });

      chipsCell.appendChild(chipsInput);
    }

    row.append(nameCell, stackCell, chipsCell);
    tableBody.appendChild(row);
  });
}

// Updates the player selection dropdowns based on the current players.
function renderPlayerControls() {
  const currentRemovalValue = removePlayerSelect.value;
  const currentBorrowerValue = borrowerSelect.value;
  const currentLenderValue = lenderSelect.value;

  removePlayerSelect.innerHTML = '';
  borrowerSelect.innerHTML = '';
  lenderSelect.innerHTML = '';

  players.forEach(player => {
    removePlayerSelect.add(new Option(player.name, player.name));
    borrowerSelect.add(new Option(player.name, player.name));
    lenderSelect.add(new Option(player.name, player.name));
  });

  // The bank is available only as a lender, never as a borrower.
  lenderSelect.add(new Option('bank', 'bank'));

  if (players.some(player => player.name === currentRemovalValue)) {
    removePlayerSelect.value = currentRemovalValue;
  }
  if (players.some(player => player.name === currentBorrowerValue)) {
    borrowerSelect.value = currentBorrowerValue;
  }
  if (players.some(player => player.name === currentLenderValue) || currentLenderValue === 'bank') {
    lenderSelect.value = currentLenderValue;
  }

  const noPlayers = players.length === 0;
  removePlayerSelect.disabled = noPlayers;
  borrowerSelect.disabled = noPlayers;
  lenderSelect.disabled = noPlayers;
  borrowButton.disabled = noPlayers;
  playerActionButton.disabled = playerAction.value === 'removal' && noPlayers;
}

// Updates the visibility of the player name input and removal dropdown based on the selected action.
function updateActionFields() {
  const isAddMode = playerAction.value === 'add';
  playerNameInput.classList.toggle('hidden', !isAddMode);
  removePlayerSelect.classList.toggle('hidden', isAddMode);
  playerNameInput.required = isAddMode;
}

// Renders the player table and dropdowns. (Called after any change to the players array.)
function render() {
  renderTable();
  renderPlayerControls();
}

function updateThemeToggleButton() {
  const isLightTheme = document.body.dataset.theme === 'light';

  themeToggleButton.textContent = isLightTheme
    ? '◐ Dark mode'
    : '☀ Light mode';

  themeToggleButton.setAttribute(
    'aria-label',
    isLightTheme
      ? 'Switch to dark theme'
      : 'Switch to light theme'
  );
}

function toggleTheme() {
  const isLightTheme = document.body.dataset.theme === 'light';

  if (isLightTheme) {
    delete document.body.dataset.theme;
    localStorage.setItem('player-stack-theme', 'dark');
  } else {
    document.body.dataset.theme = 'light';
    localStorage.setItem('player-stack-theme', 'light');
  }

  updateThemeToggleButton();
}

function toggleChipsVisibility() {
  chipsVisible = !chipsVisible;
  toggleChipsButton.textContent = chipsVisible
    ? 'Hide total chips'
    : 'Show total chips';
  renderTable();
}

themeToggleButton.addEventListener('click', toggleTheme);
toggleChipsButton.addEventListener('click', toggleChipsVisibility);

toggleMessageButton.addEventListener('click', () => {
  showAllMessages = !showAllMessages;
  toggleMessageButton.textContent = showAllMessages
    ? 'Close'
    : 'Show All';
   renderMessages();
});

function resetButtonText() {
  clearInterval(confirmInterval);
  confirmInterval = null;
  resetButton.textContent = 'Reset Game';
  resetConfirm = false;
}

resetButton.addEventListener('click', () => {
  // Check if the button is already in the confirmation state
  if (resetConfirm) {
    resetButtonText();
    resetGameState(); // Clear the saved state from localForage
    players.length = 0;
    showMessage('Game has been reset.', true);
    render();
  } else {
    // First click: switch to confirmation state
    let timeout = confirmTimeoutSeconds
    resetConfirm = true;
    resetButton.textContent = `Confirm Reset? (${timeout})`;

    confirmInterval = setInterval(() => {
      timeout--;
      if (timeout > 0) {
        resetButton.textContent = `Confirm Reset? (${timeout})`;
      } else {
        resetButtonText();
      }
    }, 1000);
  }
});

undoButton.addEventListener('click', undo);
redoButton.addEventListener('click', redo);

playerAction.addEventListener('change', () => {
  updateActionFields();
  renderPlayerControls();
});

playerActionButton.addEventListener('click', () => {
  if (playerAction.value === 'add') {
    const name = playerNameInput.value.trim();

    if (!name) {
      showMessage('Please enter a player name.');
      return;
    }
    if (findPlayer(name)) {
      showMessage('A player with that name already exists.');
      return;
    }

    saveStateForUndo();
    players.push(new Player(name));
    playerNameInput.value = '';
    showMessage(`Added ${name} with stack 1.`, true);
    saveGameState(); // Save the current state to localForage
  } 
  else 
  {
    const name = removePlayerSelect.value;
    const index = players.findIndex(player => player.name === name);

    if (index === -1) {
      showMessage('Please choose a player to remove.');
      return;
    }

    saveStateForUndo();
    players.splice(index, 1);
    showMessage(`Removed ${name}.`, true);
    saveGameState(); // Save the current state to localForage
  }

  render();
});

borrowButton.addEventListener('click', () => {
  const borrower = findPlayer(borrowerSelect.value);
  const lenderName = lenderSelect.value;

  if (!borrower) {
    showMessage('Please choose a borrower.');
    return;
  }
  if (!lenderName) {
    showMessage('Please choose a lender.');
    return;
  }
  if (borrower.name === lenderName) {
    showMessage('A player cannot borrow from themselves.');
    return;
  }

  if (lenderName === 'bank') {
    // Borrowing from the bank increases only the borrower's stack.
    saveStateForUndo();
    borrower.stack += 1;
    showMessage(`${borrower.name} borrowed 1 stack from the bank.`, true);
    saveGameState(); // Save the current state to localForage
  } else {
    const lender = findPlayer(lenderName);
    if (!lender) {
      showMessage('The selected lender does not exist.');
      return;
    }

    saveStateForUndo();
    borrower.stack += 1;
    lender.stack -= 1;
    showMessage(`${borrower.name} borrowed 1 stack from ${lender.name}.`, true);
    saveGameState(); // Save the current state to localForage
  }

  render();
});

// Initialize the interface with no players.
function initialize() {
  const savedTheme = localStorage.getItem('player-stack-theme');
  if (savedTheme === 'light') {
    document.body.dataset.theme = 'light';
  }
  updateThemeToggleButton();
  renderMessages();
  updateHistoryButtons();
  updateActionFields();
  render();
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadGameState();
  console.log('Game state loaded from localForage.');
  initialize();
  console.log('Player Stack Manager initialized.');
  // console.log('Current players:', players);
});

// console.log(typeof undoStack, typeof redoStack, typeof messages, typeof players);