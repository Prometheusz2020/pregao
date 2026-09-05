async function buscarOportunidades(termoServico = '', valorMaximo = 50000) {
  // Gera a data de hoje no padrão AAAAMMDD
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia = String(hoje.getDate()).padStart(2, '0');
  const dataHoje = `${ano}${mes}${dia}`;

  const codigoDispensa = 8; // Modalidade: Dispensa de Licitação
  const url = new URL('https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao');

  url.searchParams.set('dataInicial', dataHoje);
  url.searchParams.set('dataFinal', dataHoje);
  url.searchParams.set('codigoModalidadeContratacao', codigoDispensa.toString());
  url.searchParams.set('pagina', '1');
  url.searchParams.set('tamanhoPagina', '50');

  console.log(`Buscando publicações do dia ${dia}/${mes}/${ano}...`);

  try {
    const response = await fetch(url.toString(), {
      headers: { 'accept': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Erro na requisição: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const itens = data.data || [];

    // Filtra pelo teto de valor e pelo termo de serviço (se informado)
    const filtrados = itens.filter(item => {
      const valor = item.valorTotalEstimado || 0;
      const atendeValor = valor > 0 && valor <= valorMaximo;
      const atendeTermo = termoServico 
        ? (item.objetoCompra || '').toLowerCase().includes(termoServico.toLowerCase())
        : true;

      return atendeValor && atendeTermo;
    });

    console.log(`Encontrados: ${filtrados.length} itens correspondentes.`);

    return filtrados.map(item => ({
      orgao: item.orgaoEntidade?.razaoSocial || 'Não informado',
      objeto: item.objetoCompra,
      valor: `R$ ${Number(item.valorTotalEstimado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      linkPNCP: `https://pncp.gov.br/app/editais/${item.numeroControlePNCP}`
    }));
  } catch (error) {
    console.error('Falha ao consultar API do PNCP:', error.message);
    return [];
  }
}

// Altere o termo de busca conforme o serviço desejado
buscarOportunidades('serviço', 50000).then(resultados => {
  console.table(resultados);
});