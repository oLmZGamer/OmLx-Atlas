const searchInput = document.getElementById('searchInput');
const resultsDiv = document.getElementById('results');
let games = [];
let selectedIndex = -1;

// Load games on start
async function init() {
    games = await window.electronAPI.getAllGames();
    searchInput.focus();
}

searchInput.addEventListener('input', () => {
    const query = searchInput.value.toLowerCase();
    if (!query) {
        resultsDiv.style.display = 'none';
        return;
    }

    const filtered = games.filter(g =>
        g.name.toLowerCase().includes(query) ||
        g.launcher.toLowerCase().includes(query)
    ).slice(0, 5);

    renderResults(filtered);
});

function renderResults(filtered) {
    if (filtered.length === 0) {
        resultsDiv.style.display = 'none';
        return;
    }

    resultsDiv.innerHTML = '';
    filtered.forEach((game, index) => {
        const div = document.createElement('div');
        div.className = 'result-item';
        div.innerHTML = `
            <img src="${game.coverPath || '../../assets/placeholder.png'}" alt="">
            <div>
                <div style="font-weight: 500">${game.name}</div>
                <div style="font-size: 12px; opacity: 0.5">${game.launcher.toUpperCase()}</div>
            </div>
        `;
        div.onclick = () => launch(game);
        resultsDiv.appendChild(div);
    });

    resultsDiv.style.display = 'block';
    // Update window height based on results
    adjustWindowHeight(filtered.length);
}

function adjustWindowHeight(count) {
    // We would need an IPC call here to resize the window, 
    // but for now the results container handles it visually.
}

async function launch(game) {
    await window.electronAPI.launchGame(game);
    window.electronAPI.closeSpotlight();
}

// Handle Key Events
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.electronAPI.closeSpotlight();
    }
    if (e.key === 'Enter') {
        const firstResult = resultsDiv.querySelector('.result-item');
        if (firstResult) firstResult.click();
    }
});

init();
