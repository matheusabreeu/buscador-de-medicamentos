export default async function handler(req, res) {
  const { remedio } = req.query;

  if (!remedio) {
    return res.status(400).json({ erro: "Informe o parâmetro ?remedio=" });
  }

  try {
    const resultados = await Promise.all([
      buscarExtrafarma(remedio),
      buscarPagueMenos(remedio),
      buscarDrogasil(remedio)
    ]);

    const todos = resultados.flat().sort((a, b) => a.preco - b.preco);

    res.status(200).json(todos);

  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao buscar medicamentos" });
  }
}

//
// ===============================
// EXTRAFARMA
// ===============================
//

async function buscarExtrafarma(medicamento) {
  try {
    const termo = encodeURIComponent(medicamento);

    const url = `https://www.extrafarma.com.br/api/catalog_system/pub/products/search/${termo}`;

    const response = await fetch(url);

    if (!response.ok) return [];

    const data = await response.json();

    return data.map(produto => {
      const sku = produto.items?.[0];
      const seller = sku?.sellers?.[0];

      return {
        loja: "Extrafarma",
        nome: produto.productName,
        preco: seller?.commertialOffer?.Price || 0,
        link: produto.link,
        imagem: sku?.images?.[0]?.imageUrl || ""
      };
    }).filter(p => p.preco > 0);

  } catch {
    return [];
  }
}

//
// ===============================
// PAGUE MENOS
// ===============================
//

async function buscarPagueMenos(medicamento) {
  try {
    const termo = encodeURIComponent(medicamento);

    const url = `https://www.paguemenos.com.br/api/catalog_system/pub/products/search/${termo}`;

    const response = await fetch(url);

    if (!response.ok) return [];

    const data = await response.json();

    return data.map(produto => {
      const sku = produto.items?.[0];
      const seller = sku?.sellers?.[0];

      return {
        loja: "Pague Menos",
        nome: produto.productName,
        preco: seller?.commertialOffer?.Price || 0,
        link: produto.link,
        imagem: sku?.images?.[0]?.imageUrl || ""
      };
    }).filter(p => p.preco > 0);

  } catch {
    return [];
  }
}

//
// ===============================
// DROGASIL (API OFICIAL RD)
// ===============================
//

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

    return produtos.map(produto => {
      return {
        loja: "Drogasil",
        nome: produto.name,
        preco: produto?.price?.finalPrice || 0,
        link: `https://www.drogasil.com.br${produto.url}`,
        imagem: produto.images?.[0]?.url || ""
      };
    }).filter(p => p.preco > 0);

  } catch (erro) {
    console.log("Erro Drogasil:", erro);
    return [];
  }
}
