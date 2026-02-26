const express = require('express');
const app = express();
app.use(express.urlencoded({ extended: true }));

async function buscarFarmacia(medicamento, loja) {
    try {
        const dominios = { 
            'Extrafarma': 'www.extrafarma.com.br', 
            'Pague Menos': 'www.paguemenos.com.br', 
            'Drogaria Globo': 'www.drogariaglobo.com.br' 
        };
        const url = 'https://' + dominios[loja] + '/api/catalog_system/pub/products/search?ft=' + encodeURIComponent(medicamento) + '&_from=0&_to=10';
        
        // Timeout de 5 segundos para garantir que o site carregue rápido
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
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
        listaHTML = '<div class="text-center p-10 bg-slate-900 rounded-3xl border border-white/5"><p class="text-slate-400 font-bold uppercase text-sm">⚠️ Nada encontrado. Use os links manuais abaixo.</p></div>';
    } else {
        resultados.forEach((r, idx) => {
            const cor = r.loja === 'Extrafarma' ? 'text-cyan-400' : (r.loja === 'Drogaria Globo' ? 'text-orange-400' : 'text-red-400');
            listaHTML += `
                <div class="bg-white/5 p-4 rounded-3xl border border-white/10 mb-4 shadow-xl">
                    <div class="flex items-center gap-4 mb-3">
                        <img src="${r.imagem}" class="w-16 h-16 rounded-lg bg-white object-contain p-1 flex-shrink-0">
                        <div class="flex-1 min-w-0">
                            ${idx === 0 ? '<span class="bg-emerald-500/20 text-emerald-400 text-[8px] px-2 py-0.5 rounded-full font-black uppercase mb-1 inline-block">Melhor Preço</span>' : ''}
                            <h3 class="text-xs font-bold text-slate-100 uppercase leading-tight">${r.nome}</h3>
                        </div>
                    </div>
                    <div class="flex justify-between items-center bg-black/20 p-4 rounded-xl">
                        <div>
                            <p class="text-[10px] font-black ${cor} uppercase">${r.loja}</p>
                            <p class="text-white font-mono text-2xl font-black">${r.preco}</p>
                        </div>
                        <a href="${r.link}" target="_blank" class="bg-cyan-600 px-5 py-3 rounded-xl text-[10px] font-black text-white uppercase shadow-lg">COMPRAR</a>
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
    </head>
    <body class="bg-slate-950 text-slate-100 p-4 font-sans selection:bg-cyan-500/30">
        <div class="max-w-md mx-auto">
            <header class="text-center py-10">
                <a href="/"><h1 class="text-3xl font-black text-cyan-500 italic uppercase tracking-tighter leading-none mb-3">Buscador de preços<br>nas farmácias 💊</h1></a>
                <p class="text-emerald-500 text-[10px] font-bold uppercase tracking-widest">Os melhores preços para a Família Abreu</p>
            </header>

            <form method="POST" action="/" class="bg-slate-900 p-6 rounded-[35px] border border-white/10 shadow-2xl mb-10">
                <input type="text" name="remedio" value="${q}" placeholder="Digite aqui" required
                       class="w-full bg-slate-800 p-5 rounded-2xl mb-8 border border-white/5 focus:border-cyan-500 transition text-white text-lg outline-none placeholder-slate-500">
                
                <div class="mb-8 bg-slate-950/50 p-5 rounded-2xl border border-white/5">
                    <div class="flex justify-between items-center mb-6 border-b border-white/5 pb-3">
                        <span class="text-[10px] font-black text-slate-500 uppercase">Farmácias Ativas</span>
                        <label class="flex items-center gap-2 text-[10px] font-bold text-cyan-400 cursor-pointer">
                            <input type="checkbox" onclick="toggleAll(this)" checked class="rounded bg-slate-800 border-white/10 text-cyan-500"> TODAS
                        </label>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-x-4 gap-y-8">
                        <label class="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" name="lojas" value="Extrafarma" ${selecionadas.includes('Extrafarma') ? 'checked' : ''} class="rounded bg-slate-800 border-white/10 text-cyan-500"> Extrafarma</label>
                        <label class="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" name="lojas" value="Pague Menos" ${selecionadas.includes('Pague Menos') ? 'checked' : ''} class="rounded bg-slate-800 border-white/10 text-red-500"> Pague Menos</label>
                        <label class="flex items-center gap-2 text-sm cursor-pointer col-span-2"><input type="checkbox" name="lojas" value="Drogaria Globo" ${selecionadas.includes('Drogaria Globo') ? 'checked' : ''} class="rounded bg-slate-800 border-white/10 text-orange-500"> Drogaria Globo</label>
                        
                        <div class="flex flex-col gap-1 pt-4 border-t border-white/5">
                           <label class="flex items-center gap-2 text-sm italic opacity-40"><input type="checkbox" disabled class="rounded bg-slate-800 border-white/10"> Drogasil</label>
                           <a href="https://www.drogasil.com.br" target="_blank" class="text-[10px] text-blue-400 font-black underline uppercase">Acessar site →</a>
                        </div>
                        <div class="flex flex-col gap-1 pt-4 border-t border-white/5">
                           <label class="flex items-center gap-2 text-sm italic opacity-40"><input type="checkbox" disabled class="rounded bg-slate-800 border-white/10"> Ultrafarma</label>
                           <a href="https://www.ultrafarma.com.br" target="_blank" class="text-[10px] text-blue-400 font-black underline uppercase">Acessar site →</a>
                        </div>
                    </div>
                </div>
                <button type="submit" class="w-full bg-cyan-600 p-5 rounded-2xl font-black uppercase text-xs shadow-lg hover:bg-cyan-500 transition active:scale-95">🔍 BUSCAR AGORA</button>
            </form>

            <div class="space-y-4 mb-16">${listaHTML}</div>

            <div class="mt-12 pt-8 border-t border-white/10 text-center">
                <p class="text-slate-400 text-xs uppercase font-bold mb-8">Clique na farmácia abaixo para saber o cashback de hoje no Méliuz:</p>
                
                <div class="grid grid-cols-2 gap-3 mb-10">
                    <a href="https://www.meliuz.com.br/desconto/extrafarma" target="_blank" class="bg-slate-900 p-5 rounded-2xl border border-white/10 text-[10px] text-cyan-400 font-black uppercase">Extrafarma</a>
                    <a href="https://www.meliuz.com.br/desconto/cupom-pague-menos" target="_blank" class="bg-slate-900 p-5 rounded-2xl border border-white/10 text-[10px] text-red-400 font-black uppercase">Pague Menos</a>
                    <a href="https://www.meliuz.com.br/desconto/cupom-drogasil" target="_blank" class="bg-slate-900 p-5 rounded-2xl border border-white/10 text-[10px] text-emerald-400 font-black uppercase">Drogasil</a>
                    <a href="https://www.meliuz.com.br/desconto/ultrafarma" target="_blank" class="bg-slate-900 p-5 rounded-2xl border border-white/10 text-[10px] text-emerald-400 font-black uppercase">Ultrafarma</a>
                </div>

                <div class="bg-emerald-500/5 p-6 rounded-3xl border border-emerald-500/20 text-left">
                    <p class="text-emerald-400 text-xs font-black uppercase mb-3">Como ativar o dinheiro de volta:</p>
                    <p class="text-slate-400 text-[10px] uppercase font-bold leading-relaxed">
                        1. Toque em uma farmácia acima.<br>
                        2. No site do Méliuz, toque em "ATIVAR CASHBACK".<br>
                        3. Volte aqui e finalize sua busca.
                    </p>
                </div>
            </div>
        </div>
    </body>
    </html>`);
});

module.exports = app;
