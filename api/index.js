const express = require('express');
const app = express();
app.use(express.urlencoded({ extended: true }));

const cashDict = {
    'Extrafarma': { pct: 2.5, label: '2,5%' },
    'Pague Menos': { pct: 8, label: '8%' },
    'Drogasil': { pct: 3, label: 'Até 3%' },
    'Ultrafarma': { pct: 3, label: 'Até 3%' },
    'Drogaria Globo': { pct: 0, label: '0%' }
};

async function buscarFarmacia(medicamento, loja) {
    try {
        const dominios = { 
            'Extrafarma': 'www.extrafarma.com.br', 
            'Pague Menos': 'www.paguemenos.com.br', 
            'Drogaria Globo': 'www.drogariaglobo.com.br' 
        };
        const url = 'https://' + dominios[loja] + '/api/catalog_system/pub/products/search?ft=' + encodeURIComponent(medicamento) + '&_from=0&_to=10';
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const data = await response.json();
        return data.map(p => {
            const item = p.items && p.items[0];
            const price = item?.sellers?.[0]?.commertialOffer?.Price;
            if (!price || price <= 0) return null;
            return {
                loja: loja, nome: p.productName, valor: price,
                preco: price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                link: p.link.startsWith('http') ? p.link : 'https://' + dominios[loja] + p.link,
                imagem: (item.images && item.images[0] && item.images[0].imageUrl) || ''
            };
        }).filter(i => i !== null);
    } catch (e) { return []; }
}

app.all('*', async (req, res) => {
    const q = req.body.remedio || '';
    let selecionadas = req.body.lojas || ['Extrafarma', 'Pague Menos', 'Drogaria Globo'];
    if (!Array.isArray(selecionadas)) selecionadas = [selecionadas];

    let resultados = [];
    if (q) {
        const buscas = selecionadas.map(l => buscarFarmacia(q, l));
        const resTotal = await Promise.all(buscas);
        resultados = resTotal.flat().sort((a, b) => a.valor - b.valor);
    }

    let listaHTML = '';
    if (q && resultados.length === 0) {
        listaHTML = '<div class="text-center p-10 bg-slate-900 rounded-3xl border border-white/5"><p class="text-slate-400 font-bold uppercase text-lg">⚠️ Nada encontrado. Tente os links abaixo.</p></div>';
    } else {
        resultados.forEach((r, idx) => {
            const cor = r.loja === 'Extrafarma' ? 'text-cyan-400' : (r.loja === 'Drogaria Globo' ? 'text-orange-400' : 'text-red-400');
            listaHTML += `
                <div class="bg-white/5 p-6 rounded-[35px] border border-white/10 mb-8 shadow-2xl">
                    <div class="flex items-center gap-6 mb-4">
                        <img src="${r.imagem}" class="w-24 h-24 rounded-2xl bg-white object-contain p-2 flex-shrink-0">
                        <div class="flex-1">
                            ${idx === 0 ? '<span class="bg-emerald-500/20 text-emerald-400 text-xs px-3 py-1 rounded-full font-black uppercase mb-2 inline-block">Melhor Preço</span>' : ''}
                            <h3 class="text-xl font-black text-slate-100 uppercase leading-tight">${r.nome}</h3>
                        </div>
                    </div>
                    <div class="flex justify-between items-center bg-black/30 p-5 rounded-2xl border border-white/5">
                        <div>
                            <p class="text-sm font-black ${cor} uppercase tracking-widest">${r.loja}</p>
                            <p class="text-white font-mono text-4xl font-black mt-1">${r.preco}</p>
                        </div>
                        <a href="${r.link}" target="_blank" class="bg-cyan-600 px-8 py-5 rounded-2xl text-sm font-black text-white uppercase shadow-lg">COMPRAR</a>
                    </div>
                </div>`;
        });
    }

    res.send(`<!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.tailwindcss.com"></script>
        <title>Buscador de preços nas farmácias</title>
        <script>function toggleAll(m){document.getElementsByName('lojas').forEach(c=>c.checked=m.checked);}</script>
        <style>body { font-size: 20px; }</style>
    </head>
    <body class="bg-slate-950 text-slate-100 p-4 font-sans selection:bg-cyan-500/30">
        <div class="max-w-md mx-auto">
            <header class="text-center py-12">
                <a href="/"><h1 class="text-4xl font-black text-cyan-500 italic uppercase tracking-tighter leading-none mb-4">Buscador de preços<br>nas farmácias 💊</h1></a>
                <p class="text-emerald-500 text-sm font-bold uppercase">Monitoramento para a Família Abreu</p>
            </header>

            <form method="POST" action="/" class="bg-slate-900 p-10 rounded-[40px] border border-white/10 shadow-2xl mb-16">
                <input type="text" name="remedio" value="${q}" placeholder="Digite aqui..." required
                       class="w-full bg-slate-800 p-8 rounded-3xl mb-10 border-2 border-white/5 focus:border-cyan-500 transition text-white text-2xl outline-none">
                
                <div class="mb-10 bg-slate-950/50 p-8 rounded-3xl border border-white/5">
                    <div class="flex justify-between items-center mb-8 border-b border-white/5 pb-4">
                        <span class="text-base font-black text-slate-500 uppercase">Farmácias Ativas</span>
                        <label class="flex items-center gap-3 text-base font-bold text-cyan-400 cursor-pointer">
                            <input type="checkbox" onclick="toggleAll(this)" checked class="w-6 h-6 rounded bg-slate-800 border-white/10 text-cyan-500"> TODAS
                        </label>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-x-4 gap-y-10">
                        <label class="flex items-center gap-3 text-base cursor-pointer"><input type="checkbox" name="lojas" value="Extrafarma" ${selecionadas.includes('Extrafarma') ? 'checked' : ''} class="w-6 h-6 rounded bg-slate-800 border-white/10 text-cyan-500"> Extrafarma</label>
                        <label class="flex items-center gap-3 text-base cursor-pointer"><input type="checkbox" name="lojas" value="Pague Menos" ${selecionadas.includes('Pague Menos') ? 'checked' : ''} class="w-6 h-6 rounded bg-slate-800 border-white/10 text-red-500"> Pague Menos</label>
                        <label class="flex items-center gap-3 text-base cursor-pointer col-span-2"><input type="checkbox" name="lojas" value="Drogaria Globo" ${selecionadas.includes('Drogaria Globo') ? 'checked' : ''} class="w-6 h-6 rounded bg-slate-800 border-white/10 text-orange-500"> Drogaria Globo</label>
                        
                        <div class="flex flex-col gap-2 pt-6 border-t border-white/5 opacity-80">
                           <label class="flex items-center gap-3 text-base italic opacity-40"><input type="checkbox" disabled class="w-6 h-6 rounded bg-slate-800 border-white/10"> Drogasil</label>
                           <a href="https://www.drogasil.com.br" target="_blank" class="text-sm text-blue-400 font-black underline uppercase tracking-tighter">Acessar site →</a>
                        </div>
                        <div class="flex flex-col gap-2 pt-6 border-t border-white/5 opacity-80">
                           <label class="flex items-center gap-3 text-base italic opacity-40"><input type="checkbox" disabled class="w-6 h-6 rounded bg-slate-800 border-white/10"> Ultrafarma</label>
                           <a href="https://www.ultrafarma.com.br" target="_blank" class="text-sm text-blue-400 font-black underline uppercase tracking-tighter">Acessar site →</a>
                        </div>
                    </div>
                </div>
                <button type="submit" class="w-full bg-cyan-600 p-8 rounded-3xl font-black uppercase text-lg shadow-lg hover:bg-cyan-500 transition active:scale-95">🔍 BUSCAR AGORA</button>
            </form>

            <div class="space-y-8 mb-20">${listaHTML}</div>

            <div class="mt-24 pt-12 border-t border-white/10 text-center">
                <p class="text-slate-400 text-lg uppercase font-bold leading-relaxed mb-10 tracking-tighter">Toque na farmácia abaixo para conferir o desconto de hoje no Méliuz:</p>
                
                <div class="grid grid-cols-2 gap-5 mb-12">
                    <a href="https://www.meliuz.com.br/desconto/extrafarma" target="_blank" class="bg-slate-900 p-8 rounded-[30px] border border-white/10 hover:bg-slate-800">
                        <p class="text-sm text-cyan-400 font-black uppercase">Extrafarma</p></a>
                    <a href="https://www.meliuz.com.br/desconto/cupom-pague-menos" target="_blank" class="bg-slate-900 p-8 rounded-[30px] border border-white/10 hover:bg-slate-800">
                        <p class="text-sm text-red-400 font-black uppercase">Pague Menos</p></a>
                    <a href="https://www.meliuz.com.br/desconto/cupom-drogasil" target="_blank" class="bg-slate-900 p-8 rounded-[30px] border border-white/10 hover:bg-slate-800">
                        <p class="text-sm text-emerald-400 font-black uppercase">Drogasil</p></a>
                    <a href="https://www.meliuz.com.br/desconto/ultrafarma" target="_blank" class="bg-slate-900 p-8 rounded-[30px] border border-white/10 hover:bg-slate-800">
                        <p class="text-sm text-emerald-400 font-black uppercase">Ultrafarma</p></a>
                </div>

                <div class="bg-emerald-500/5 p-8 rounded-3xl border border-emerald-500/20 shadow-inner">
                    <p class="text-emerald-400 text-lg font-black uppercase mb-4 tracking-tighter">COMO ATIVAR O DINHEIRO DE VOLTA:</p>
                    <p class="text-slate-400 text-base uppercase font-bold leading-relaxed">
                        1. Toque em uma farmácia acima.<br>
                        2. No site que abrir, toque em "ATIVAR CASHBACK".<br>
                        3. Volte aqui, faça sua busca e finalize a compra.
                    </p>
                </div>
            </div>
        </div>
    </body>
    </html>`);
});

module.exports = app;
