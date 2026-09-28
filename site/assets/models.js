// Fictional model lineup. Field names mirror GA4 ecommerce "items" so the
// same object can be pushed to the dataLayer without remapping.
window.MODELS = [
  {
    item_id: 'ceres',
    item_name: 'Ceres',
    item_category: '세단',
    price: 32900000,
    tagline: '도심을 위한 가장 조용한 세단',
    fuel: '가솔린 2.0',
    efficiency: '13.2 km/L',
    seats: 5,
    color: 'linear-gradient(135deg, #1f2a44, #3b4f7a)',
  },
  {
    item_id: 'ravon',
    item_name: 'Ravon',
    item_category: 'SUV',
    price: 41500000,
    tagline: '주말을 넓히는 패밀리 SUV',
    fuel: '가솔린 2.5 · AWD',
    efficiency: '11.4 km/L',
    seats: 7,
    color: 'linear-gradient(135deg, #2e4a3a, #5a8a6a)',
  },
  {
    item_id: 'prima',
    item_name: 'Prima',
    item_category: '하이브리드',
    price: 36800000,
    tagline: '연비와 정숙함, 둘 다 포기하지 않은 하이브리드',
    fuel: '하이브리드 1.8',
    efficiency: '21.8 km/L',
    seats: 5,
    color: 'linear-gradient(135deg, #3a3a55, #7a6aa0)',
  },
  {
    item_id: 'vento',
    item_name: 'Vento',
    item_category: '미니밴',
    price: 45200000,
    tagline: '온 가족이 함께, 넉넉한 3열 미니밴',
    fuel: '하이브리드 2.5',
    efficiency: '15.1 km/L',
    seats: 7,
    color: 'linear-gradient(135deg, #5a3a2a, #a07a4a)',
  },
];

window.REGIONS = [
  { id: 'seoul', name: '서울', dealer: '서울 강남 전시장' },
  { id: 'gyeonggi', name: '경기', dealer: '분당 판교 전시장' },
  { id: 'incheon', name: '인천', dealer: '인천 송도 전시장' },
  { id: 'busan', name: '부산', dealer: '부산 해운대 전시장' },
  { id: 'daegu', name: '대구', dealer: '대구 수성 전시장' },
  { id: 'daejeon', name: '대전', dealer: '대전 둔산 전시장' },
  { id: 'gwangju', name: '광주', dealer: '광주 상무 전시장' },
];
