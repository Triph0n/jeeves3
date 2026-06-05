/*
   BAXTER - English Club Personal Secretariat
   Core Javascript Logic (app.js)
*/

document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------
    // 1. STATE & STORAGE MANAGEMENT
    // ----------------------------------------------------
    function setTextIfPresent(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    }

    let state = {
        tasks: JSON.parse(localStorage.getItem('baxter_tasks')) || [],
        cellarItems: JSON.parse(localStorage.getItem('baxter_cellar')) || [],
        telegramText: localStorage.getItem('baxter_telegram') || '',
        activeView: 'view-morning-room'
    };

    function saveTasks() {
        localStorage.setItem('baxter_tasks', JSON.stringify(state.tasks));
        updateDashboardStats();
    }

    function saveCellar() {
        localStorage.setItem('baxter_cellar', JSON.stringify(state.cellarItems));
        updateDashboardStats();
    }

    function saveTelegram() {
        localStorage.setItem('baxter_telegram', state.telegramText);
        updateDashboardStats();
    }

    // ----------------------------------------------------
    // 2. TIMERS, CLOCKS & DATES
    // ----------------------------------------------------
    function updateClock() {
        const timeDisplay = document.getElementById('header-time');
        const dateDisplay = document.getElementById('header-date');
        const gazetteDate = document.getElementById('gazette-date');
        const telDate = document.getElementById('tel-date');
        const telTime = document.getElementById('tel-time');

        const now = new Date();
        
        // Format Time
        let hours = now.getHours();
        let minutes = now.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // the hour '0' should be '12'
        minutes = minutes < 10 ? '0' + minutes : minutes;
        const timeString = `${hours}:${minutes} ${ampm}`;
        
        if (timeDisplay) timeDisplay.textContent = timeString;
        if (telTime) telTime.textContent = timeString;

        // Format Date (e.g. Wednesday, 27 May 2026)
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const fullMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        
        const dayName = days[now.getDay()];
        const dayNum = now.getDate();
        const monthName = months[now.getMonth()];
        const fullMonthName = fullMonths[now.getMonth()];
        const year = now.getFullYear();

        const dateStr = `${dayNum} ${monthName} ${year}`;
        const gazetteStr = `${dayName}, ${dayNum} ${fullMonthName} ${year}`;

        if (dateDisplay) dateDisplay.textContent = dateStr;
        if (gazetteDate) gazetteDate.textContent = gazetteStr;
        if (telDate) telDate.textContent = `${dayNum} ${monthName} ${year}`;
    }
    
    updateClock();
    setInterval(updateClock, 1000);

    // Simulated Weather (Vary slightly based on day for aesthetic dynamism)
    const weatherConditions = [
        { temp: '16Â°C', desc: 'Overcast & Drizzly', icon: 'fa-cloud-rain' },
        { temp: '18Â°C', desc: 'Slightly Breezy', icon: 'fa-wind' },
        { temp: '19Â°C', desc: 'Splendid & Sunny', icon: 'fa-sun' },
        { temp: '15Â°C', desc: 'Foggy Outlook', icon: 'fa-smog' }
    ];
    
    function updateWeather() {
        const date = new Date();
        const index = date.getDate() % weatherConditions.length;
        const condition = weatherConditions[index];

        setTextIfPresent('weather-temp', condition.temp);
        setTextIfPresent('weather-condition', condition.desc);
        const iconEl = document.getElementById('weather-icon-class');
        if (iconEl) iconEl.className = `fa-solid ${condition.icon}`;
    }
    updateWeather();

    // ----------------------------------------------------
    // 3. TAB ROUTING / VIEWS MANAGEMENT
    // ----------------------------------------------------
    const navButtons = document.querySelectorAll('.nav-btn');
    
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');
            
            // Toggle active classes on buttons
            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Toggle view panels
            const views = ['view-morning-room', 'view-library-ledger', 'view-cellar-book', 'view-telegram-office'];
            views.forEach(v => {
                const el = document.getElementById(v);
                if (v === target) {
                    el.style.display = 'flex';
                } else {
                    el.style.display = 'none';
                }
            });
            
            state.activeView = target;
            playPageTurnSound();
        });
    });

    // ----------------------------------------------------
    // 4. THE LIBRARY LEDGER (TASK MANAGER)
    // ----------------------------------------------------
    const ledgerForm = document.getElementById('ledger-form');
    const ledgerTbody = document.getElementById('ledger-tbody');
    const emptyRow = document.getElementById('ledger-empty-row');

    function renderTasks() {
        // Clear all rows except the empty row placeholder
        const rows = ledgerTbody.querySelectorAll('.task-row[data-ledger-task]');
        rows.forEach(r => r.remove());

        const visibleTasks = state.tasks
            .map((task, index) => ({ task, index }))
            .filter(({ task }) => !task.completed);
        const serverRows = ledgerTbody.querySelectorAll('.task-row:not([data-ledger-task])');

        if (visibleTasks.length === 0 && serverRows.length === 0) {
            emptyRow.style.display = '';
            return;
        }

        emptyRow.style.display = 'none';

        visibleTasks.forEach(({ task, index }) => {
            const tr = document.createElement('tr');
            tr.className = 'task-row';
            tr.dataset.ledgerTask = 'true';
            tr.innerHTML = `
                <td style="text-align: center;">
                    <div class="custom-checkbox" data-index="${index}"></div>
                </td>
                <td>
                    <span class="task-text">${task.name}</span>
                </td>
                <td>
                    <span class="tag-badge tag-${task.category}">${task.category.replace('-', ' ')}</span>
                </td>
                <td>
                    <span class="priority-cell priority-${task.priority}">${task.priority}</span>
                </td>
                <td style="text-align: center;">
                    <button class="btn-remove" data-index="${index}">
                        <i class="fa-solid fa-square-minus"></i>
                    </button>
                </td>
            `;

            // Checkbox event
            tr.querySelector('.custom-checkbox').addEventListener('click', (e) => {
                toggleTask(index);
            });

            // Remove event
            tr.querySelector('.btn-remove').addEventListener('click', (e) => {
                deleteTask(index);
            });

            ledgerTbody.appendChild(tr);
        });
    }

    function addTask(name, category, priority) {
        state.tasks.push({
            name: name,
            category: category,
            priority: priority,
            completed: false
        });
        saveTasks();
        renderTasks();
    }

    function toggleTask(index) {
        state.tasks[index].completed = !state.tasks[index].completed;
        saveTasks();
        renderTasks();
        playInkSound();
    }

    function deleteTask(index) {
        state.tasks.splice(index, 1);
        saveTasks();
        renderTasks();
    }

    ledgerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('task-name');
        const catSelect = document.getElementById('task-category');
        const prioSelect = document.getElementById('task-priority');

        if (nameInput.value.trim()) {
            addTask(nameInput.value.trim(), catSelect.value, prioSelect.value);
            nameInput.value = '';
            playInkSound();
        }
    });

    // ----------------------------------------------------
    // 5. THE CELLAR BOOK (INVENTORY & CATALOG)
    // ----------------------------------------------------
    const cellarForm = document.getElementById('cellar-form');
    const cellarGrid = document.getElementById('cellar-grid-container');

    function renderCellar() {
        cellarGrid.innerHTML = '';

        if (state.cellarItems.length === 0) {
            cellarGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; color: var(--color-ink-faded); padding: 50px; font-style: italic;">
                    No bottles, items, or books recorded in the Cellar Book. The shelves are bare, sir.
                </div>
            `;
            return;
        }

        state.cellarItems.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = 'cellar-card';
            card.innerHTML = `
                <div class="cellar-label">
                    <div class="cellar-name">${item.name}</div>
                    <div class="cellar-cat">${item.category.replace('-', ' & ')}</div>
                    <div class="cellar-qty">Qty: ${item.qty}</div>
                </div>
                <div class="cellar-notes">
                    ${item.notes ? item.notes : 'No extra notes recorded.'}
                </div>
                <div class="cellar-card-footer">
                    <span class="cellar-meta-text">${item.year ? 'Vintage: ' + item.year : 'No Year'}</span>
                    <div class="cellar-card-actions">
                        <button class="cellar-card-btn dec-qty" data-index="${index}" title="Reduce Quantity">
                            <i class="fa-solid fa-circle-minus"></i>
                        </button>
                        <button class="cellar-card-btn inc-qty" data-index="${index}" title="Increase Quantity">
                            <i class="fa-solid fa-circle-plus"></i>
                        </button>
                        <button class="cellar-card-btn remove-item" data-index="${index}" style="margin-left: 10px; color: var(--color-wax-red);" title="Remove Record">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>
            `;

            // Card Event Listeners
            card.querySelector('.dec-qty').addEventListener('click', () => {
                updateItemQty(index, -1);
            });
            card.querySelector('.inc-qty').addEventListener('click', () => {
                updateItemQty(index, 1);
            });
            card.querySelector('.remove-item').addEventListener('click', () => {
                deleteCellarItem(index);
            });

            cellarGrid.appendChild(card);
        });
    }

    function addCellarItem(name, qty, category, year) {
        let defaultNotes = '';
        if (category === 'wine-spirit') defaultNotes = 'Stored in the East wing racks.';
        else if (category === 'cigar-tobacco') defaultNotes = 'Kept under optimal humidity.';
        else if (category === 'library-book') defaultNotes = 'Placed on the mahogany shelf.';
        else defaultNotes = 'Stored in the club cabinets.';

        state.cellarItems.push({
            name: name,
            qty: parseInt(qty) || 1,
            category: category,
            year: year || 'N/A',
            notes: defaultNotes
        });
        saveCellar();
        renderCellar();
    }

    function updateItemQty(index, delta) {
        state.cellarItems[index].qty = Math.max(0, state.cellarItems[index].qty + delta);
        if (state.cellarItems[index].qty === 0) {
            deleteCellarItem(index);
        } else {
            saveCellar();
            renderCellar();
        }
    }

    function deleteCellarItem(index) {
        state.cellarItems.splice(index, 1);
        saveCellar();
        renderCellar();
    }

    cellarForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('item-name');
        const qtyInput = document.getElementById('item-qty');
        const catSelect = document.getElementById('item-category');
        const yearInput = document.getElementById('item-year');

        if (nameInput.value.trim()) {
            addCellarItem(
                nameInput.value.trim(),
                qtyInput.value,
                catSelect.value,
                yearInput.value.trim()
            );
            nameInput.value = '';
            qtyInput.value = '1';
            yearInput.value = '';
            playInkSound();
        }
    });

    // ----------------------------------------------------
    // 6. THE TELEGRAM OFFICE
    // ----------------------------------------------------
    const telInput = document.getElementById('telegram-input');
    const telWordCount = document.getElementById('tel-word-count');
    const btnClearTelegram = document.getElementById('btn-clear-telegram');
    const btnCopyTelegram = document.getElementById('btn-copy-telegram');
    const btnDownloadTelegram = document.getElementById('btn-download-telegram');

    // Load initial telegram text
    telInput.value = state.telegramText;
    updateWordCount(state.telegramText);

    telInput.addEventListener('input', (e) => {
        // Enforce classic telegram capitalisation for fun and visual style
        let val = e.target.value.toUpperCase();
        
        // Auto replace dot with ' STOP ' if user hits dot? We can just let them write it, but let's do a simple count
        e.target.value = val;
        state.telegramText = val;
        saveTelegram();
        updateWordCount(val);
    });

    function updateWordCount(text) {
        if (!text.trim()) {
            telWordCount.textContent = '0 words';
            return;
        }
        const words = text.trim().split(/\s+/).filter(w => w.length > 0);
        telWordCount.textContent = `${words.length} words`;
    }

    btnClearTelegram.addEventListener('click', () => {
        telInput.value = '';
        state.telegramText = '';
        saveTelegram();
        updateWordCount('');
        playInkSound();
    });

    btnCopyTelegram.addEventListener('click', () => {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(telInput.value).then(() => {
                alert("Telegram text copied to clipboard!");
            });
        }
    });

    btnDownloadTelegram.addEventListener('click', () => {
        const text = telInput.value;
        if (!text.trim()) {
            alert("Please compose your dispatch before sending, sir.");
            return;
        }
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `TELEGRAM-DISPATCH-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // ----------------------------------------------------
    // 7. DASHBOARD STATS SYNCHRONIZATION
    // ----------------------------------------------------
    function updateDashboardStats() {
        const pendingCount = state.tasks.filter(t => !t.completed).length;

        setTextIfPresent('gazette-pending-tasks', pendingCount);
        setTextIfPresent('stats-tasks', pendingCount);
        setTextIfPresent('stats-cellar', state.cellarItems.length);
        
        // Count telegram draft words
        const telWords = state.telegramText.trim() ? state.telegramText.trim().split(/\s+/).length : 0;
        setTextIfPresent('stats-telegrams', telWords);
    }

    // ----------------------------------------------------
    // 8. THE BUTLER MECHANISM (AI/BUTLER DIALOGUES)
    // ----------------------------------------------------
    const butlerBell = document.getElementById('butler-bell-trigger');
    const butlerBubble = document.getElementById('butler-speech-bubble');
    const butlerText = document.getElementById('butler-speech-text');

    const butlerQuotes = [
        "\"Good day, sir. The fire has been stoked, the brandy remains undisturbed in the decanter, and the weather is exceedingly pleasant.\"",
        "\"It is a good rule in life never to apologize, sir. The right sort of people do not want apologies, and the wrong sort take a mean advantage of them.\"",
        "\"A clean slate in the Ledger. Might I suggest a brisk walk in the gardens, or perhaps a glass of vintage port?\"",
        "\"You have outstanding affairs in the Library, sir. Should I fetch a pot of strong black coffee to assist?\"",
        "\"The telegraph lines to London are open, sir. Should you wish to send a dispatch to your aunt.\"",
        "\"Excellent choice of vintage, sir. The cellar-book speaks highly of your impeccable taste.\"",
        "\"I must advise against wearing the purple socks today, sir. They do not harmonize with the club's library upholstery.\"",
        "\"The Earl of Emsworth has reported that Empress of Blandings has won another silver medal. A grand day for the shire, indeed.\"",
        "\"Memory is a good thing, sir, but the ability to forget is a grand thing.\"",
        "\"He had the look of one who has searched for the leak in life's gas-pipe with a lighted candle. We must aim to be more cheerful, sir.\"",
        "\"A gentleman should never carry a pocket notebook, sir. That is precisely what I am here for.\"",
        "\"I have always found it best to keep an eye on the little things, sir. The large ones usually look after themselves.\""
    ];

    let bubbleTimeout;

    butlerBell.addEventListener('click', () => {
        playBellChime();
        
        // Generate Butler response based on stats
        const pendingCount = state.tasks.filter(t => !t.completed).length;
        let response = '';

        if (pendingCount > 4) {
            response = `"We have quite a few outstanding duties in the library ledger, sir. I advise we tackle them. Best not dilly-dally."`;
        } else if (state.activeView === 'view-telegram-office' && state.telegramText.length > 0) {
            response = `"A most urgent telegram, sir? I shall ensure the courier has his boots polished and horse saddled."`;
        } else if (state.activeView === 'view-cellar-book' && state.cellarItems.length === 0) {
            response = `"The cellar appears entirely empty, sir! A tragic affair. Shall I contact the wine merchant in London immediately?"`;
        } else {
            // Pick a random PG Wodehouse or butler wisdom
            const randomIndex = Math.floor(Math.random() * butlerQuotes.length);
            response = butlerQuotes[randomIndex];
        }

        butlerText.textContent = response;
        butlerBubble.classList.add('visible');

        // Reset auto-dismiss timer
        clearTimeout(bubbleTimeout);
        bubbleTimeout = setTimeout(() => {
            butlerBubble.classList.remove('visible');
        }, 12000);
    });

    // Dismiss speech bubble when clicking elsewhere
    document.addEventListener('click', (e) => {
        if (!butlerBell.contains(e.target) && !butlerBubble.contains(e.target)) {
            butlerBubble.classList.remove('visible');
        }
    });

    // ----------------------------------------------------
    // 9. WEB AUDIO API SYNTHESIZER (BELL CHIME & EFFECTS)
    // ----------------------------------------------------
    let audioCtx = null;

    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    function playBellChime() {
        initAudio();
        if (!audioCtx) return;

        const now = audioCtx.currentTime;
        
        // Brass bell harmonics
        const frequencies = [880, 1200, 1500, 1800, 2200];
        const gains = [0.12, 0.06, 0.04, 0.02, 0.01];

        frequencies.forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);

            gainNode.gain.setValueAtTime(gains[idx], now);
            // Bell rings, then decays exponentially
            gainNode.gain.exponentialRampToValueAtTime(0.00001, now + 2.5);

            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            osc.start(now);
            osc.stop(now + 2.6);
        });
    }

    function playPageTurnSound() {
        initAudio();
        if (!audioCtx) return;

        const now = audioCtx.currentTime;
        const noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.15, audioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        
        // Populate with white noise
        for (let i = 0; i < noiseBuffer.length; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        const whiteNoise = audioCtx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1000, now);
        filter.frequency.exponentialRampToValueAtTime(300, now + 0.15);
        filter.Q.value = 1.0;

        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(0.05, now);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

        whiteNoise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        whiteNoise.start(now);
        whiteNoise.stop(now + 0.2);
    }

    function playInkSound() {
        initAudio();
        if (!audioCtx) return;

        const now = audioCtx.currentTime;
        
        // Very brief scratchy frequency
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(600, now + 0.08);

        gainNode.gain.setValueAtTime(0.02, now);
        gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.08);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start(now);
        osc.stop(now + 0.1);
    }

    // ----------------------------------------------------
    // 10. INITIALIZATION
    // ----------------------------------------------------
    renderTasks();
    renderCellar();
    updateDashboardStats();

    // ----------------------------------------------------
    // 11. BAXTER API INTEGRATION
    // ----------------------------------------------------
    document.querySelectorAll('[data-job]').forEach((button) => {
        button.addEventListener('click', async () => {
            const label = button.textContent.trim();
            button.disabled = true;
            
            // Show Butler thinking
            butlerText.textContent = `"Working on ${label}, sir. One moment..."`;
            butlerBubble.classList.add('visible');
            clearTimeout(bubbleTimeout);

            try {
                const response = await fetch(button.dataset.job, { method: 'POST' });
                const payload = await response.json();
                
                let lines = [`${payload.status}: ${payload.message}`];
                if (payload.outputs && payload.outputs.length) {
                    lines.push('Outputs:');
                    payload.outputs.forEach((o) => lines.push(o));
                }
                if (payload.output_urls && payload.output_urls.length) {
                    payload.output_urls.forEach((url) => window.open(url, '_blank', 'noopener'));
                }
                if (payload.manual_url) {
                    butlerText.innerHTML = '"Opening PDF for signature, sir..."';
                    setTimeout(() => {
                        window.location.href = payload.manual_url;
                    }, 1000);
                    return;
                }
                butlerText.innerHTML = lines.join('<br>');
                
                bubbleTimeout = setTimeout(() => {
                    butlerBubble.classList.remove('visible');
                }, 8000);

            } catch (error) {
                butlerText.textContent = `"I am terribly sorry sir, but the action failed: ${error}"`;
                bubbleTimeout = setTimeout(() => {
                    butlerBubble.classList.remove('visible');
                }, 8000);
            } finally {
                button.disabled = false;
            }
        });
    });

    // ----------------------------------------------------
    // 11.5 BEWERBUNG AUS INSERAT
    // ----------------------------------------------------
    const bewerbungForm = document.getElementById('bewerbung-form');
    if (bewerbungForm) {
        bewerbungForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const urlInput = document.getElementById('bewerbung-url');
            const url = urlInput.value.trim();
            if (!url) return;
            
            const btn = document.getElementById('btn-bewerbung');
            btn.disabled = true;
            
            // Show Butler thinking
            butlerText.textContent = `"Processing the job advertisement, sir. I am extracting the details..."`;
            butlerBubble.classList.add('visible');
            clearTimeout(bubbleTimeout);

            try {
                const response = await fetch('/api/applications/from-url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: url })
                });
                const payload = await response.json();
                
                butlerText.innerHTML = `"${payload.message}"`;
                
                // Refresh the page to show the updated applications list
                setTimeout(() => {
                    window.location.reload();
                }, 2000);
            } catch (error) {
                butlerText.textContent = `"I am terribly sorry sir, but the application extraction failed: ${error}"`;
                bubbleTimeout = setTimeout(() => {
                    butlerBubble.classList.remove('visible');
                }, 8000);
                btn.disabled = false;
            }
        });
    }

    function showButlerMessage(message, timeout = 5000) {
        butlerText.textContent = `"${message}"`;
        butlerBubble.classList.add('visible');
        clearTimeout(bubbleTimeout);
        bubbleTimeout = setTimeout(() => {
            butlerBubble.classList.remove('visible');
        }, timeout);
    }

    function removeApplicationFromDashboard(applicationId, triggerButton) {
        const escapedId = window.CSS?.escape ? window.CSS.escape(applicationId) : applicationId.replace(/["\\]/g, '\\$&');
        const card = triggerButton.closest('.application-card')
            || document.querySelector(`.application-card[data-application-id="${escapedId}"]`);
        if (card) card.remove();

        const list = document.getElementById('bewerbung-list');
        if (list && !list.querySelector('.application-card')) {
            list.innerHTML = '<div class="application-empty-state">Žádné připravené inzeráty.</div>';
        }
    }

    document.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-discard-application]');
        if (!button) return;

        const applicationId = button.dataset.discardApplication;
        if (!applicationId || button.disabled) return;
        if (!window.confirm('Zahodit tento inzerát z přehledu? Vytvořené soubory zůstanou uložené.')) return;

        button.disabled = true;
        try {
            const response = await fetch(`/api/applications/${encodeURIComponent(applicationId)}`, {
                method: 'DELETE',
                headers: { 'Accept': 'application/json' },
                cache: 'no-store'
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload.status !== 'done') {
                throw new Error(payload.message || `Zahození se nepovedlo (${response.status}).`);
            }

            removeApplicationFromDashboard(applicationId, button);
            showButlerMessage(payload.message || 'Inzerát jsem zahodil z přehledu.');
        } catch (error) {
            button.disabled = false;
            showButlerMessage(`I am terribly sorry sir, but I could not discard that advertisement: ${error}`, 8000);
        }
    });

});


// ----------------------------------------------------
// 12. MANUAL SIGNING LOGIC
// ----------------------------------------------------
(function () {
  const manualRoot = document.querySelector('.manual[data-job-id]');
  if (!manualRoot) return;

  const jobId = manualRoot.dataset.jobId;
  const pagesContainer = document.getElementById('pagesContainer');
  const signaturePreview = document.getElementById('signaturePreview');
  const stage = document.getElementById('pdfStage');
  const prevPage = document.getElementById('prevPage');
  const nextPage = document.getElementById('nextPage');
  const pageLabel = document.getElementById('pageLabel');
  const sizeSlider = document.getElementById('sizeSlider');
  const sizeLabel = document.getElementById('sizeLabel');
  const confirmSign = document.getElementById('confirmSign');
  const manualResult = document.getElementById('manualResult');

  if (!pagesContainer || !signaturePreview || !stage) return;

  const state = { pageIndex: 0, pageCount: 0, pages: [], hover: null, placed: null, busy: false };
  loadManualJob();

  async function loadManualJob() {
    const response = await fetch(`/api/manual-sign/${jobId}`);
    const payload = await response.json();
    if (payload.status !== 'needs_input') {
      manualResult.textContent = payload.message || 'Cannot load task.';
      return;
    }
    state.pageIndex = payload.page_index;
    state.pageCount = payload.page_count;
    state.pages = payload.pages || [];
    sizeSlider.value = payload.signature_width_mm;
    updateSizeLabel();
    renderPages();
  }

  function renderPages() {
    pagesContainer.textContent = '';
    state.pages.forEach((page) => {
      const wrap = document.createElement('div');
      wrap.className = 'page-wrap';
      wrap.dataset.pageIndex = String(page.index);
      wrap.dataset.pageWidth = String(page.width);
      wrap.dataset.pageHeight = String(page.height);
      wrap.style.width = 'min(100%, 920px)';
      wrap.style.margin = '0 auto 20px auto';
      wrap.style.position = 'relative';
      wrap.style.boxShadow = '0 5px 15px rgba(0,0,0,0.2)';

      const image = document.createElement('img');
      image.src = `/api/manual-sign/${jobId}/page/${page.index}.png?ts=${Date.now()}`;
      image.alt = `Page ${page.index + 1}`;
      image.style.width = '100%';
      image.style.display = 'block';
      wrap.append(image);
      pagesContainer.append(wrap);
    });
    updatePager();
    requestAnimationFrame(() => scrollToPage(state.pageIndex));
  }

  function updatePager() {
    pageLabel.textContent = `${state.pageIndex + 1} / ${state.pageCount}`;
    prevPage.disabled = state.pageIndex <= 0;
    nextPage.disabled = state.pageIndex >= state.pageCount - 1;
  }

  function updateSizeLabel() {
    sizeLabel.textContent = `${sizeSlider.value} mm`;
    updateSignaturePreview();
  }

  function updateSignaturePreview() {
    const target = state.placed || state.hover;
    if (!target) return;
    const rect = target.rect;
    const widthPts = Number(sizeSlider.value) * 72 / 25.4;
    const widthPx = (widthPts / target.pageWidth) * rect.width;
    signaturePreview.style.left = `${target.clientX}px`;
    signaturePreview.style.top = `${target.clientY}px`;
    signaturePreview.style.width = `${widthPx}px`;
    signaturePreview.style.display = 'block';
    
    if (state.placed) {
      signaturePreview.style.opacity = '1.0';
      confirmSign.disabled = false;
      confirmSign.innerHTML = '<i class="fa-solid fa-file-export"></i> Export to PDF';
    } else {
      signaturePreview.style.opacity = '0.6';
      confirmSign.disabled = true;
      confirmSign.innerHTML = '<i class="fa-solid fa-stamp"></i> Aim at PDF';
    }
  }

  function pageFromEvent(event) {
    const wrap = event.target.closest('.page-wrap');
    if (!wrap) return null;
    const image = wrap.querySelector('img');
    const rect = image.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
    
    const pageWidth = Number(wrap.dataset.pageWidth);
    const pageHeight = Number(wrap.dataset.pageHeight);
    return {
      pageIndex: Number(wrap.dataset.pageIndex),
      pageWidth, pageHeight,
      centerX: (x / rect.width) * pageWidth,
      centerY: (y / rect.height) * pageHeight,
      clientX: event.clientX, clientY: event.clientY, rect
    };
  }

  function scrollToPage(pageIndex) {
    const page = pagesContainer.querySelector(`[data-page-index="${pageIndex}"]`);
    if (page) page.scrollIntoView({ block: 'center' });
  }

  stage.addEventListener('mousemove', (event) => {
    if (state.placed) return; // Don't move if already placed
    const hover = pageFromEvent(event);
    if (!hover || state.busy) {
      state.hover = null;
      signaturePreview.style.display = 'none';
      return;
    }
    state.hover = hover;
    state.pageIndex = hover.pageIndex;
    updatePager();
    updateSignaturePreview();
  });

  stage.addEventListener('mouseleave', () => {
    if (state.placed) return; // Don't hide if placed
    state.hover = null;
    signaturePreview.style.display = 'none';
    confirmSign.disabled = true;
    confirmSign.innerHTML = '<i class="fa-solid fa-stamp"></i> Aim at PDF';
  });

  stage.addEventListener('click', async (event) => {
    const hover = pageFromEvent(event);
    if (!hover || state.busy) return;
    
    // Toggle placement
    if (state.placed) {
      // Re-place at new location
      state.placed = hover;
    } else {
      // Place it for the first time
      state.placed = hover;
    }
    updateSignaturePreview();
  });

  sizeSlider.addEventListener('input', updateSizeLabel);
  window.addEventListener('resize', updateSignaturePreview);

  prevPage.addEventListener('click', () => {
    if (state.pageIndex > 0) {
      state.pageIndex -= 1;
      scrollToPage(state.pageIndex);
      updatePager();
    }
  });

  nextPage.addEventListener('click', () => {
    if (state.pageIndex < state.pageCount - 1) {
      state.pageIndex += 1;
      scrollToPage(state.pageIndex);
      updatePager();
    }
  });

  confirmSign.addEventListener('click', completeAtPlaced);

  async function completeAtPlaced() {
    if (!state.placed || state.busy) return;
    state.busy = true;
    confirmSign.disabled = true;
    prevPage.disabled = true;
    nextPage.disabled = true;
    manualResult.textContent = 'Imprinting signature...';
    
    const response = await fetch(`/api/manual-sign/${jobId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_index: state.placed.pageIndex,
        center_x: state.placed.centerX,
        center_y: state.placed.centerY,
        width_mm: Number(sizeSlider.value),
      }),
    });
    const payload = await response.json();
    
    if (payload.status === 'done') {
      stage.classList.add('completed');
      confirmSign.innerHTML = '<i class="fa-solid fa-check"></i> Completed';
      if (payload.output_urls && payload.output_urls.length) {
        const outputUrl = payload.output_urls[0];
        manualResult.innerHTML = `Completed: ${payload.message}<br><a href="${outputUrl}" style="color: var(--color-ink);">Open Signed PDF</a>`;
        setTimeout(() => { window.location.href = outputUrl; }, 600);
      } else {
        manualResult.textContent = `Completed: ${payload.message}`;
      }
    } else {
      manualResult.textContent = `${payload.status}: ${payload.message}`;
      state.busy = false;
      confirmSign.disabled = false;
      prevPage.disabled = state.pageIndex <= 0;
      nextPage.disabled = state.pageIndex >= state.pageCount - 1;
    }
  }
})();
