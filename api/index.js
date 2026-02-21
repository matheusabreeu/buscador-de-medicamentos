const cheerio = require("cheerio");

/* =========================
   VTEX
========================= */
async function buscarVTEX(medicamento, loja, dominio) {
  try {
    const termo = encodeURIComponent(medicamento);
    const url = `https://${dominio}/api/catalog_system/pub/products/search?ft=${termo}&_from=0&_to=20`;

    const response = await fetch(url);
    if (!response.ok) return [];

    const produtos = await response.json();

    return produtos
      .map(p => {
        const item = p.items?.[0];
        const preco = item?.sellers?.[0]?.commertialOffer?.Price;

        if (!preco || preco <= 0) return null;

        return {
          loja,
          nome: p.productName,
          preco,
          link: p.link,
          imagem: item?.images?.[0]?.imageUrl || ""
        };
      })
      .filter(Boolean);

  } catch (err) {
    return [];
  }
}

/* =========================
   DROGASIL
========================= */
async function buscarDrogasil(medicamento) {
  try {
    const termo = encodeURIComponent(medicamento);

    const url = `https://api-gateway-prod.raiadrogasil.com.br/search/v2/br/drogasil/search?term=${termo}&limit=20&offset=0`;

    const response = await fetch(url, {
      headers: {
        "accept": "application/json",
        "x-api-key": "rd-site",
        "user-agent": "Mozilla/5.0"
      }
    });

    if (!response.ok) {
      console.log("Erro Drogasil:", response.status);
      return [];
    }

    const data = await response.json();

    const produtos = data?.results?.products || [];

    return produtos
      .map(produto => {
        const preco = produto?.price?.finalPrice;

        if (!preco) return null;

        return {
          loja: "Drogasil",
          nome: produto.name,
          preco: Number(preco),
          link: `https://www.drogasil.com.br${produto.url}`,
          imagem: produto.images?.[0]?.url || ""
        };
      })
      .filter(Boolean);

  } catch (erro) {
    console.log("Erro ao buscar Drogasil:", erro);
    return [];
  }
}

/* =========================
   HANDLER VERCEL
========================= */
module.exports = async (req, res) => {

  const { remedio } = req.query;

  if (!remedio) {
    return res.status(200).json({
      mensagem: "Use ?remedio=nome_do_medicamento"
    });
  }

  const promessas = [
    buscarVTEX(remedio, "Extrafarma", "www.extrafarma.com.br"),
    buscarVTEX(remedio, "Pague Menos", "www.paguemenos.com.br"),
    buscarVTEX(remedio, "Globo", "www.drogariasglobo.com.br"),
    buscarDrogasil(remedio)
  ];

  const resposta = await Promise.allSettled(promessas);

  const resultados = resposta
    .filter(r => r.status === "fulfilled")
    .flatMap(r => r.value)
    .sort((a, b) => a.preco - b.preco);

  res.setHeader("Cache-Control", "s-maxage=60");

  return res.status(200).json(resultados);
};
