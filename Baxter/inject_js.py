import sys

js_file = r'C:\Users\Vladimir\Documents\Baxter\static\app.js'
with open(js_file, 'r', encoding='utf-16') as f:
    content = f.read()

# Add Baxter API logic inside DOMContentLoaded
injection = """
    // ----------------------------------------------------
    // 11. BAXTER API INTEGRATION
    // ----------------------------------------------------
    document.querySelectorAll('[data-job]').forEach((button) => {
        button.addEventListener('click', async () => {
            const label = button.textContent.trim();
            button.disabled = true;
            
            // Show Butler thinking
            butlerText.textContent = `\"Working on ${label}, sir. One moment...\"`;
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
                    butlerText.innerHTML = '\"Opening PDF for signature, sir...\"';
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
                butlerText.textContent = `\"I am terribly sorry sir, but the action failed: ${error}\"`;
                bubbleTimeout = setTimeout(() => {
                    butlerBubble.classList.remove('visible');
                }, 8000);
            } finally {
                button.disabled = false;
            }
        });
    });
"""

# We need to insert this before the final '});' of DOMContentLoaded
end_idx = content.rfind('});')
if end_idx != -1:
    content = content[:end_idx] + injection + '\n});\n'

# Add Manual Signing IIFE at the end
manual_sign_iife = """
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

  const state = { pageIndex: 0, pageCount: 0, pages: [], hover: null, busy: false };
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
    if (!state.hover) return;
    const rect = state.hover.rect;
    const widthPts = Number(sizeSlider.value) * 72 / 25.4;
    const widthPx = (widthPts / state.hover.pageWidth) * rect.width;
    signaturePreview.style.left = `${state.hover.clientX}px`;
    signaturePreview.style.top = `${state.hover.clientY}px`;
    signaturePreview.style.width = `${widthPx}px`;
    signaturePreview.style.display = 'block';
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
    const hover = pageFromEvent(event);
    if (!hover || state.busy) {
      state.hover = null;
      signaturePreview.style.display = 'none';
      return;
    }
    state.hover = hover;
    state.pageIndex = hover.pageIndex;
    confirmSign.disabled = false;
    confirmSign.innerHTML = '<i class="fa-solid fa-stamp"></i> Click to Imprint';
    updatePager();
    updateSignaturePreview();
  });

  stage.addEventListener('mouseleave', () => {
    state.hover = null;
    signaturePreview.style.display = 'none';
    confirmSign.disabled = true;
    confirmSign.innerHTML = '<i class="fa-solid fa-stamp"></i> Aim at PDF';
  });

  stage.addEventListener('click', async (event) => {
    const hover = pageFromEvent(event);
    if (!hover || state.busy) return;
    state.hover = hover;
    await completeAtHover();
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

  confirmSign.addEventListener('click', completeAtHover);

  async function completeAtHover() {
    if (!state.hover || state.busy) return;
    state.busy = true;
    confirmSign.disabled = true;
    prevPage.disabled = true;
    nextPage.disabled = true;
    signaturePreview.style.display = 'none';
    manualResult.textContent = 'Imprinting signature...';
    
    const response = await fetch(`/api/manual-sign/${jobId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_index: state.hover.pageIndex,
        center_x: state.hover.centerX,
        center_y: state.hover.centerY,
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
"""

content += '\n' + manual_sign_iife

with open(js_file, 'w', encoding='utf-8') as f:
    f.write(content)
