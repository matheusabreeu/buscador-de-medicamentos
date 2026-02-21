export default async function handler(req, res) {
  const remedio = req.query.q;

  if (!remedio) {
    return res.status(400).json({ erro: "Informe o medicamento na query ?q=" });
  }

  try {
    const [extrafarma, paguemenos, drogasil] = await Promise.all([
      buscarVTEX("extrafarma", remedio),
      buscarVTEX("paguemenos", remedio),
      buscarVTEX("drogasil", remedio),
    ]);

    const resultados = [
      ...extrafarma,
      ...paguemenos,
      ...drogasil
    ];

    res.status(200).json(resultados);

  } catch (error) {
    res.status(500).json({ erro: "Erro na busca", detalhe: error.message });
  }
}

async function buscarVTEX(loja, termo) {
  try {
    const response = await fetch(
      `https://www.${loja}.com.br/api/catalog_system/pub/products/search?ft=${encodeURIComponent(termo)}`
    );

    if (!response.ok) return [];

    const data = await response.json();

    return data.slice(0, 5).map(produto => {
      const sku = produto.items?.[0]?.sellers?.[0];
      return {
        loja: capitalizar(loja),
        nome: produto.productName,
        preco: sku?.commertialOffer?.Price || null,
        link: `https://www.${loja}.com.br${produto.link}`,
        imagem: produto.items?.[0]?.images?.[0]?.imageUrl || null
      };
    });

  } catch {
    return [];
  }
}

function capitalizar(nome) {
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}
