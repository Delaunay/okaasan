// Level 2 vocabulary: words, example sentences and translations from the
// 90 Day Korean beginner list (https://www.90daykorean.com/korean-words/),
// grouped by topic.

export interface Vocab {
  ko: string;
  rom: string;
  en: string;
  ex?: { ko: string; rom: string; en: string };
}

export interface VocabUnit {
  id: string;
  title: string;
  words: Vocab[];
}

export const VOCAB_UNITS: VocabUnit[] = [
  { id: 'v-greetings', title: 'Greetings', words: [
    { ko: '안녕하세요', rom: 'annyeonghaseyo', en: 'hello' },
    { ko: '감사합니다', rom: 'gamsahamnida', en: 'thank you' },
    { ko: '천만에요', rom: 'cheonmaneyo', en: "you're welcome" },
    { ko: '죄송합니다', rom: 'joesonghamnida', en: "I'm sorry" },
    { ko: '잠시만요', rom: 'jamsimanyo', en: 'excuse me (one moment)' },
    { ko: '괜찮아요', rom: 'gwaenchanayo', en: "it's okay" },
    { ko: '주세요', rom: 'juseyo', en: 'please give me' },
    { ko: '네', rom: 'ne', en: 'yes', ex: { ko: '네, 오늘 조금 피곤해요.', rom: 'ne, oneul jogeum pigonhaeyo.', en: "Yes, I'm a little tired today." } },
    { ko: '아니요', rom: 'aniyo', en: 'no', ex: { ko: '아니요. 불만있습니다!', rom: 'aniyo. bulmanitseumnida!', en: 'No. I have a complaint.' } },
  ] },
  { id: 'v-phrases', title: 'Everyday phrases', words: [
    { ko: '몰라요', rom: 'mollayo', en: "I don't know" },
    { ko: '알아요', rom: 'arayo', en: 'I know' },
    { ko: '이해해요', rom: 'ihaehaeyo', en: 'I understand' },
    { ko: '좋아요', rom: 'joayo', en: 'good' },
    { ko: '안 좋아요', rom: 'an joayo', en: 'not good' },
    { ko: '고맙습니다', rom: 'gomapseumnida', en: 'thank you' },
    { ko: '저기요', rom: 'jeogiyo', en: 'excuse me (to get attention)' },
    { ko: '여기요', rom: 'yeogiyo', en: 'over here! (calling staff)' },
    { ko: '얼마예요?', rom: 'eolmayeyo?', en: 'how much is it?' },
    { ko: '도와 주세요', rom: 'dowa juseyo', en: 'please help me' },
    { ko: '대박', rom: 'daebak', en: 'awesome!' },
    { ko: '화이팅', rom: 'hwaiting', en: 'you can do it!' },
  ] },
  { id: 'v-basics', title: 'Basic words', words: [
    { ko: '집', rom: 'jip', en: 'house', ex: { ko: '집에 도착했어요.', rom: 'jibe dochakaesseoyo', en: 'I arrived at my house.' } },
    { ko: '화장실', rom: 'hwajangsil', en: 'bathroom', ex: { ko: '화장실 앞에서 20분이나 기다렸어요.', rom: 'hwajangsil apeseo isipbunina gidaryeosseoyo.', en: 'I waited in front of the bathroom for 20 minutes.' } },
    { ko: '나라', rom: 'nara', en: 'country', ex: { ko: '나는 따뜻한 나라가 너무 좋아!', rom: 'naneun ttatteuthan naraga neomu joa!', en: 'I really like warm countries!' } },
    { ko: '직업', rom: 'jigeop', en: 'job', ex: { ko: '직업이 뭐예요?', rom: 'jigeobi mwoyeyo?', en: "What's your job?" } },
    { ko: '사람', rom: 'saram', en: 'person', ex: { ko: '어느 나라 사람이에요?', rom: 'eoneu nara saramieyo?', en: 'What country are you from?' } },
    { ko: '왼쪽', rom: 'oenjjok', en: 'left', ex: { ko: '그림을 왼쪽으로 옮겨주세요.', rom: 'geurimeul oenjjogeuro omgyeojuseyo.', en: 'Please move the picture to the left.' } },
    { ko: '오른쪽', rom: 'oreunjjok', en: 'right', ex: { ko: '내리실 문은 오른쪽입니다.', rom: 'naerisil muneun oreunjjogimnida', en: 'The exit door is on the right.' } },
    { ko: '우리', rom: 'uri', en: 'we, our' },
    { ko: '왜', rom: 'wae', en: 'why' },
    { ko: '언제', rom: 'eonje', en: 'when' },
  ] },
  { id: 'v-food', title: 'Food', words: [
    { ko: '물', rom: 'mul', en: 'water', ex: { ko: '하루에 물 세 잔 마셔요.', rom: 'harue mul se jan masyeoyo.', en: 'I drink 3 glasses of water a day' } },
    { ko: '밥', rom: 'bap', en: 'rice, meal', ex: { ko: '내일 밥 같이 먹을래요?', rom: 'naeil bap gachi meogeullaeyo?', en: 'Shall we eat together tomorrow?' } },
    { ko: '야채', rom: 'yachae', en: 'vegetables', ex: { ko: '시장에서 야채를 샀어요.', rom: 'sijangeseo yachaereul sasseoyo.', en: 'I bought vegetables at the market' } },
    { ko: '과일', rom: 'gwail', en: 'fruit', ex: { ko: '어떤 과일 좋아하세요?', rom: 'eotteon gwail joahaseyo?', en: 'What kind of fruit do you like?' } },
    { ko: '고기', rom: 'gogi', en: 'meat', ex: { ko: '어제 저녁에 고기를 구워 먹었어요.', rom: 'eoje jeonyeoge gogireul guwo meogeosseoyo.', en: 'Last night I ate grilled meat' } },
    { ko: '빵', rom: 'ppang', en: 'bread', ex: { ko: '빵 먹을때 버터랑 잼이랑 같이 먹어요.', rom: 'ppang meogeulttae beoteorang jaemirang gachi meogeoyo.', en: 'I eat bread with butter and jam' } },
    { ko: '생선', rom: 'saengseon', en: 'fish', ex: { ko: '생선을 열 마리나 잡았어요!', rom: 'saengseoneul yeol marina jabasseoyo!', en: 'I caught 10 fish!' } },
    { ko: '커피', rom: 'keopi', en: 'coffee', ex: { ko: '저는 아침에 커피를 마시는 것을 좋아해요.', rom: 'jeoneun achime keopireul masineun geoseul joahaeyo.', en: 'I like to drink coffee in the morning' } },
    { ko: '맥주', rom: 'maekju', en: 'beer', ex: { ko: '내 남자친구는 맥주 한 병도 못 마셔요.', rom: 'nae namjachinguneun maekju han byeongdo mot masyeoyo.', en: "My boyfriend can't drink even one bottle of beer" } },
    { ko: '소주', rom: 'soju', en: 'soju', ex: { ko: '나랑 친구는 소주를 좋아해요.', rom: 'narang chinguneun sojureul joahaeyo', en: 'My friend and I like soju' } },
  ] },
  { id: 'v-family', title: 'Family', words: [
    { ko: '친구', rom: 'chingu', en: 'friend', ex: { ko: '오늘 친구하고 만나기로 했어요.', rom: 'oneul chinguhago mannagiro haesseoyo.', en: 'I made plans to meet my friend today' } },
    { ko: '가족', rom: 'gajok', en: 'family', ex: { ko: '가족들과 함께 여행을 가요', rom: 'gajokdeulgwa hamkke yeohaengeul gayo', en: 'I go on a trip with my family' } },
    { ko: '아빠', rom: 'appa', en: 'dad', ex: { ko: '우리 아빠 친절하세요', rom: 'uri appa chinjeolhaseyo', en: 'My dad is kind' } },
    { ko: '엄마', rom: 'eomma', en: 'mom', ex: { ko: '어제 엄마랑 통화했는데 아주 기뻐하셨어.', rom: 'eoje eommarang tonghwahaenneunde aju gippeohasyeosseo.', en: 'My mom was happy because I talked to her on the phone yesterday' } },
    { ko: '남자 친구', rom: 'namja chingu', en: 'boyfriend', ex: { ko: '아직도 남자 친구가 없어요?', rom: 'ajikdo namja chinguga eopseoyo?', en: 'Do you still not have a boyfriend?' } },
    { ko: '여자 친구', rom: 'yeoja chingu', en: 'girlfriend', ex: { ko: '여자 친구와 커피 마시러 카페에 갑니다.', rom: 'yeoja chinguwa keopi masireo kapee gamnida.', en: 'I go to cafe to drink coffee with my girlfriend.' } },
    { ko: '결혼', rom: 'gyeolhon', en: 'marriage', ex: { ko: '다음 달에 결혼할 거예요.', rom: 'daeum dare gyeolhonhal geoyeyo.', en: 'I will get married next month' } },
    { ko: '남편', rom: 'nampyeon', en: 'husband', ex: { ko: '내 첫사랑은 지금의 남편입니다.', rom: 'nae cheotsarangeun jigeumui nampyeonimnida.', en: 'My first love is now my husband' } },
    { ko: '아내', rom: 'anae', en: 'wife', ex: { ko: '아내를 만나러 왔습니다.', rom: 'anaereul mannareo watseumnida.', en: 'I came to meet my wife' } },
  ] },
  { id: 'v-time', title: 'Time', words: [
    { ko: '시간', rom: 'sigan', en: 'time, hour', ex: { ko: '저는 1시간 동안 운동했어요', rom: 'jeoneun han sigan dongan undonghaesseoyo', en: 'I exercised for 1 hour' } },
    { ko: '지금', rom: 'jigeum', en: 'now', ex: { ko: '지금 점심 시간이에요', rom: 'jigeum jeomsim siganieyo', en: "It's lunchtime now" } },
    { ko: '오늘', rom: 'oneul', en: 'today', ex: { ko: '오늘 약속 있어요?', rom: 'oneul yaksok isseoyo?', en: 'Do you have plans today?' } },
    { ko: '어제', rom: 'eoje', en: 'yesterday', ex: { ko: '어제 파티 어땠어요?', rom: 'eoje pati eottaesseoyo?', en: 'How was the party yesterday?' } },
    { ko: '내일', rom: 'naeil', en: 'tomorrow', ex: { ko: '내일 여동생 생일이에요', rom: 'naeil yeodongsaeng saengirieyo', en: "Tomorrow is my sister's birthday" } },
    { ko: '아침', rom: 'achim', en: 'morning' },
    { ko: '밤', rom: 'bam', en: 'night' },
  ] },
  { id: 'v-verbs1', title: 'Verbs 1', words: [
    { ko: '가다', rom: 'gada', en: 'to go', ex: { ko: '학원에 갑니다.', rom: 'hagwone gamnida.', en: 'I go to the academy' } },
    { ko: '오다', rom: 'oda', en: 'to come', ex: { ko: '언니가 집에서 호텔로 옵니다.', rom: 'eonniga hotello omnida.', en: 'My older sister comes from home to the hotel' } },
    { ko: '있다', rom: 'itda', en: 'to have, to exist', ex: { ko: '나 커다란 인형을 가지고 있어!', rom: 'na keodaran inhyeongeul gajigo isseo!', en: 'I have a large doll!' } },
    { ko: '이다', rom: 'ida', en: 'to be', ex: { ko: '아빠가 한국 사람이다.', rom: 'appaga hanguk saramida.', en: 'My dad is Korean' } },
    { ko: '먹다', rom: 'meokda', en: 'to eat', ex: { ko: '고양이가 생선을 먹었다.', rom: 'goyangiga saengseoneul meogeotda.', en: 'The cat ate a fish' } },
    { ko: '마시다', rom: 'masida', en: 'to drink', ex: { ko: '달리기하고 나서 물을 마십니다.', rom: 'dalligihago naseo mureul masimnida', en: 'I drink water after running' } },
    { ko: '주다', rom: 'juda', en: 'to give', ex: { ko: '아빠가 생일선물을 주셨다.', rom: 'appaga saengilseonmureul jusyeotda.', en: 'My dad gave me a birthday present' } },
    { ko: '보다', rom: 'boda', en: 'to see', ex: { ko: '갈매기를 처음 봤어요!', rom: 'galmaegireul cheoeum bwasseoyo!', en: 'I saw a seagull for the first time!' } },
    { ko: '자다', rom: 'jada', en: 'to sleep', ex: { ko: '어젯밤에 늦게 잤습니다.', rom: 'eojetbame neutge jatseumnida.', en: 'I went to sleep late last night' } },
    { ko: '일어나다', rom: 'ireonada', en: 'to wake up', ex: { ko: '오늘 오전 7시에 일어났어요.', rom: 'oneul ojeon ilgopsie ireonasseoyo.', en: 'I woke up today at 7am' } },
  ] },
  { id: 'v-verbs2', title: 'Verbs 2', words: [
    { ko: '사다', rom: 'sada', en: 'to buy', ex: { ko: '오이를 샀습니다.', rom: 'oireul satseumnida.', en: 'I bought a cucumber' } },
    { ko: '쓰다', rom: 'sseuda', en: 'to write, to use', ex: { ko: '여기에 이름을 쓰세요.', rom: 'yeogie ireumeul sseuseyo.', en: 'Please write your name here' } },
    { ko: '웃다', rom: 'utda', en: 'to laugh', ex: { ko: '그녀가 나를 보고 웃었어요.', rom: 'geunyeoga nareul bogo useosseoyo.', en: 'She looked at me and laughed' } },
    { ko: '울다', rom: 'ulda', en: 'to cry', ex: { ko: '아파서 하루 종일 울었습니다.', rom: 'apaseo haru jongil ureotseumnida.', en: 'I cried all day because I was hurt' } },
    { ko: '입다', rom: 'ipda', en: 'to wear', ex: { ko: '오늘부터 여름 옷을 입을 거에요.', rom: 'oneulbuteo yeoreum oseul ibeul geoeyo.', en: "I'll start wearing summer clothes today" } },
    { ko: '걷다', rom: 'geotda', en: 'to walk', ex: { ko: '남자 친구와 손을 잡고 걸었어요.', rom: 'namja chinguwa soneul japgo georeosseoyo.', en: "I walked holding my boyfriend's hand" } },
    { ko: '읽다', rom: 'ikda', en: 'to read', ex: { ko: '제일 좋아하는 책을 읽었습니다.', rom: 'jeil joahaneun chaegeul ilgeotseumnida.', en: 'I read my favorite book' } },
    { ko: '배우다', rom: 'baeuda', en: 'to learn', ex: { ko: '오늘부터 운전을 배워요.', rom: 'oneulbuteo unjeoneul baewoyo.', en: "I'm learning to drive starting today" } },
    { ko: '공부하다', rom: 'gongbuhada', en: 'to study', ex: { ko: '한국어 공부 같이 할래요?', rom: 'hangugeo gongbu gachi hallaeyo?', en: 'Do you want to study Korean together?' } },
    { ko: '만나다', rom: 'mannada', en: 'to meet', ex: { ko: '부모님을 만났습니다.', rom: 'bumonimeul mannatseumnida.', en: 'I met my parents' } },
  ] },
  { id: 'v-adj1', title: 'Adjectives 1', words: [
    { ko: '좋다', rom: 'jota', en: 'to be good', ex: { ko: '강아지보다 고양이가 좋아요.', rom: 'gangajiboda goyangiga joayo.', en: 'I like cats more than dogs' } },
    { ko: '싫다', rom: 'silta', en: 'to dislike', ex: { ko: '파프리카를 싫어합니다.', rom: 'papeurikareul sileohamnida.', en: "I don't like bell peppers" } },
    { ko: '덥다', rom: 'deopda', en: 'to be hot', ex: { ko: '이번 여름은 아주 더워요.', rom: 'ibeon yeoreumeun aju deowoyo.', en: 'This summer is really hot' } },
    { ko: '춥다', rom: 'chupda', en: 'to be cold', ex: { ko: '한국의 겨울은 추워요.', rom: 'hangugui gyeoureun chuwoyo.', en: 'Winter in Korea is cold' } },
    { ko: '슬프다', rom: 'seulpeuda', en: 'to be sad', ex: { ko: '다희야, 왜 슬퍼 보여?', rom: 'dahuiya, wae seulpeo boyeo?', en: 'DaHee, why do you look sad?' } },
    { ko: '아프다', rom: 'apeuda', en: 'to be sick, to hurt', ex: { ko: '언제부터 배가 아팠어요?', rom: 'eonjebuteo baega apasseoyo?', en: 'When did your stomach start hurting?' } },
    { ko: '피곤하다', rom: 'pigonhada', en: 'to be tired', ex: { ko: '오늘따라 피곤합니다.', rom: 'oneulttara pigonhamnida.', en: 'Today I am tired' } },
    { ko: '재미있다', rom: 'jaemiitda', en: 'to be fun, interesting', ex: { ko: '이 책은 정말 재밌는 것 같아요.', rom: 'i chaegeun jeongmal jaeminneun geot gatayo.', en: 'This book seems really interesting' } },
  ] },
  { id: 'v-adj2', title: 'Adjectives 2', words: [
    { ko: '재미없다', rom: 'jaemieopda', en: 'to be boring', ex: { ko: '집에만 있으면 재미없어요!', rom: 'jibeman isseumyeon jaemieopseoyo!', en: "I'm bored if I have to stay at home!" } },
    { ko: '어렵다', rom: 'eoryeopda', en: 'to be difficult', ex: { ko: '수학 문제가 가장 어렵습니다.', rom: 'suhak munjega gajang eoryeopseumnida.', en: 'Math problems are the most difficult for me' } },
    { ko: '쉽다', rom: 'swipda', en: 'to be easy', ex: { ko: '자전거 타기가 쉬워요?', rom: 'jajeongeo tagiga swiwoyo?', en: 'Is it easy to ride a bicycle?' } },
    { ko: '깨끗하다', rom: 'kkaekkeuthada', en: 'to be clean', ex: { ko: '공항이 깨끗해요.', rom: 'gonghangi kkaekkeuthaeyo.', en: 'The airport is clean' } },
    { ko: '더럽다', rom: 'deoreopda', en: 'to be dirty', ex: { ko: '앞치마가 금방 더러워졌어요.', rom: 'apchimaga geumbang deoreowojyeosseoyo.', en: 'The apron just got dirty' } },
    { ko: '빠르다', rom: 'ppareuda', en: 'to be fast', ex: { ko: '우와! 정말 빨라요.', rom: 'uwa! jeongmal ppallayo.', en: 'Wow! That is really fast' } },
    { ko: '느리다', rom: 'neurida', en: 'to be slow', ex: { ko: '거북이는 토끼보다 느려요.', rom: 'geobugineun tokkiboda neuryeoyo.', en: 'Turtles are slower than rabbits' } },
  ] },
  { id: 'v-adv1', title: 'Adverbs: how', words: [
    { ko: '매우', rom: 'maeu', en: 'very', ex: { ko: '나는 북한과 남한의 역사에 매우 관심이 있어요.', rom: 'naneun bukangwa namhanui yeoksae maeu gwansimi isseoyo', en: "I'm very interested in the history of North and South Korea." } },
    { ko: '아주', rom: 'aju', en: 'very', ex: { ko: '바닥이 아주 미끄러워요. 조심하세요.', rom: 'badagi aju mikkeureowoyo. josimhaseyo', en: 'The floor is very slippery. Please be careful.' } },
    { ko: '꽤', rom: 'kkwae', en: 'quite', ex: { ko: '이 가방은 꽤 무거워요.', rom: 'i gabangeun kkwae mugeowoyo', en: 'This bag is quite heavy.' } },
    { ko: '상당히', rom: 'sangdanghi', en: 'quite', ex: { ko: '가격은 상당히 비싼 편이에요.', rom: 'gagyeogeun sangdanghi bissan pyeonieyo', en: 'The price is quite high.' } },
    { ko: '거의', rom: 'geoui', en: 'almost', ex: { ko: '공항에 거의 다 왔어요.', rom: 'gonghange geoui da wasseoyo', en: "We're almost at the airport." } },
    { ko: '빨리', rom: 'ppalli', en: 'quickly', ex: { ko: '존은 한국어를 빨리 배우고 있어요.', rom: 'joneun hangugeoreul ppalli baeugo isseoyo', en: 'John is learning the Korean language fast.' } },
    { ko: '천천히', rom: 'cheoncheonhi', en: 'slowly', ex: { ko: '내 친구가 한국어를 천천히 배우고 있어요.', rom: 'nae chinguga hangugeoreul cheoncheonhi baeugo isseoyo', en: 'My friend is slowly learning the Korean language.' } },
    { ko: '신중하게', rom: 'sinjunghage', en: 'carefully', ex: { ko: '이 문제를 신중하게 고려해 주세요.', rom: 'i munjereul sinjunghage goryeohae juseyo', en: 'Please consider this matter carefully.' } },
  ] },
  { id: 'v-adv2', title: 'Adverbs: how often', words: [
    { ko: '항상', rom: 'hangsang', en: 'always', ex: { ko: '그는 항상 바빠요.', rom: 'geuneun hangsang bappayo', en: 'He is always busy.' } },
    { ko: '늘', rom: 'neul', en: 'always', ex: { ko: '우리는 늘 함께 점심을 먹어요.', rom: 'urineun neul hamkke jeomsimeul meogeoyo', en: 'We always eat lunch together.' } },
    { ko: '자주', rom: 'jaju', en: 'often', ex: { ko: '사람들은 한국 드라마를 보는 동안 기본적인 한국어 표현들을 자주 배울 수 있어요.', rom: 'saramdeureun hanguk deuramareul boneun dongan gibonjeogin hangugeo pyohyeondeureul jaju baeul su isseoyo', en: 'People can frequently learn basic Korean phrases while watching K-drama.' } },
    { ko: '흔히', rom: 'heunhi', en: 'often, commonly', ex: { ko: '봄에는 벚꽃을 흔히 볼 수 있어요.', rom: 'bomeneun beotkkocheul heunhi bol su isseoyo', en: 'You can see cherry blossoms commonly in spring.' } },
    { ko: '보통', rom: 'botong', en: 'usually', ex: { ko: '내 사촌은 보통 한국 음악을 듣고 한국 드라마를 봐요.', rom: 'nae sachoneun botong hanguk eumageul deutgo hanguk deuramareul bwayo', en: 'My cousins usually listen to Korean music and watch K-drama.' } },
    { ko: '가끔', rom: 'gakkeum', en: 'sometimes', ex: { ko: '순영이는 가끔 친구들에게 영어로 말해요.', rom: 'sunyeongineun gakkeum chingudeurege yeongeoro malhaeyo', en: 'Soonyoung sometimes speaks English to his friends.' } },
    { ko: '때로는', rom: 'ttaeroneun', en: 'sometimes', ex: { ko: '누구나 때로는 실수를 해요.', rom: 'nuguna ttaeroneun silsureul haeyo', en: 'Everyone makes mistakes sometimes' } },
    { ko: '좀처럼', rom: 'jomcheoreom', en: 'seldom', ex: { ko: '나는 직장에 좀처럼 지각하지 않아요.', rom: 'naneun jikjange jomcheoreom jigakaji anayo', en: 'I am seldom late for work.' } },
    { ko: '드물게', rom: 'deumulge', en: 'rarely', ex: { ko: '조슈아는 드물게 한국어를 해요.', rom: 'josyuaneun deumulge hangugeoreul haeyo', en: 'Joshua rarely speaks Korean.' } },
    { ko: '결코', rom: 'gyeolko', en: 'never', ex: { ko: '그 날을 결코 잊지 않을 거예요.', rom: 'geu nareul gyeolko itji aneul geoyeyo', en: 'I will never forget that day.' } },
    { ko: '절대', rom: 'jeoldae', en: 'never', ex: { ko: '절대 거짓말을 하지 않았어요.', rom: 'jeoldae geojinmareul haji anasseoyo', en: 'I never lied.' } },
  ] },
  { id: 'v-nature', title: 'Nature & animals', words: [
    { ko: '하늘', rom: 'haneul', en: 'sky' },
    { ko: '비', rom: 'bi', en: 'rain' },
    { ko: '바람', rom: 'baram', en: 'wind' },
    { ko: '바다', rom: 'bada', en: 'sea, ocean' },
    { ko: '마음', rom: 'maeum', en: 'mind, heart' },
    { ko: '고양이', rom: 'goyangi', en: 'cat' },
    { ko: '강아지', rom: 'gangaji', en: 'puppy, dog' },
  ] },
];

export const VOCAB = VOCAB_UNITS.flatMap((u) => u.words);
export const VOCAB_BY: Record<string, Vocab> = Object.fromEntries(VOCAB.map((w) => [w.ko, w]));
export const VOCAB_REVIEW = 'v-review';
export const NEW_WORDS_PER_LESSON = 5;

// Several words share a meaning (매우 / 아주 = very): they are never offered
// against each other, and either one is accepted when writing.
export const synonyms = (a: string, b: string) => VOCAB_BY[a].en === VOCAB_BY[b].en;
export const normalize = (s: string) => s.replace(/[\s?!.,~]/g, '');

// Stats keys: vocabulary is kept apart from the level 1 reading words.
export const vkey = (ko: string) => `v:${ko}`;
