import cheerio from "cheerio";

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
  } catch {
    return [];
  }
}

/* =========================
   DROGASIL (HTML SCRAPING)
========================= */
async function buscarDrogasil(medicamento) {
  try {
    const termo = encodeURIComponent(medicamento);
    const url = `https://www.drogasil.com.br/search?w=${termo}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "pt-BR,pt;q=0.9"
      }
    });

    if (!response.ok) return [];

    const html = await response.text();
    const $ = cheerio.load(html);

    let resultados = [];

    $("li.product-item").each((i, el) => {
      const nome = $(el).find(".product-item__name").text().trim();
      const precoTexto = $(el).find(".price").first().text().trim();
      const linkRel = $(el).find("a").attr("href");
      const imagem = $(el).find("img").attr("src");

      if (!precoTexto || !linkRel) return;

      const preco = parseFloat(
        precoTexto
          .replace("R$", "")
          .replace(/\./g, "")
          .replace(",", ".")
          .trim()
      );

      if (!preco) return;

      resultados.push({
        loja: "Drogasil",
        nome,
        preco,
        link: `https://www.drogasil.com.br${linkRel}`,
        imagem
      });
    });

    return resultados;
  } catch {
    return [];
  }
}

/* =========================
   HANDLER VERCEL
========================= */
export default async function handler(req, res) {
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
}
