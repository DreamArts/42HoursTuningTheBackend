const nameList = [
    '中野 晶真',
    '米田 康二',
    '東沢 雅人',
    '石井 達久',
    '古坂 道長',
    '十役 勝義',
    '古賀 信乃将',
    '石井 兼青',
    '中田 優一杜',
    '槇田 鈴月',
    '福島 徠貴',
    '奥山 春麻',
    '杉山 雄太',
    '秀毛 彩季哉',
    '浅野 勝昭',
    '蔵 真也',
    '八釜 すみのり',
    '説 晃',
    '賀 伊吹',
    '甘露 京一',
    '杉山 有佐多',
    '村原 求磨',
    '児玉 荘侍',
    '平田 滋志',
    '白石 潔',
    '侍浜 鏡',
    '萩原 衛司',
    '焔 空羽馬',
    '西田 湊',
    '岡 ヘイゾウ',
    '古賀 貢',
    '長谷川 陵正',
    '北神 優太',
    '田井 領森',
    '祐乗坊 大',
    '豊冨 正男',
    '吉澄 俊男',
    '石動 優雨',
    '岳山 厳影',
    '近藤 凌',
    '今井 風路',
    '片 実都芸',
    '森本 就方',
    '上野 惺武',
    '久津間 大樹',
    '源 オウシ',
    '清久 護臣',
    '田和 瑛太',
    '保昌 信行',
    '中野 晶真',
]

const groupName = [
    '広島北第二',
    '譲華地区',
    '広島北第一',
    '多摩地区',
    '都畑地区',
    '草苅地区',
    '福鹿弥南',
    '呂都禮地区',
    '掛舘地区',
    '比糠地区',
    '上波若仁海',
    '占覇地区',
    '淵雀地区',
    '内二子地区',
    '指津地区西',
    '城塔地区',
    '日野谷地区',
    '壬弾地区',
    '糸ノ本地区',
    '嶋地区',
    '茅魅地区',
    '斗桑地区',
    '鮫潮地区',
    '音坂地区',
    '嵩鋤地区',
    '仙地区',
    '鴨川地区',
    '氷崎地区',
    '掛苗地区',
    '宝達勝宮',
    '其光色区',
    '重音賀区',
    '婦念地区東',
    '宝上志内',
    '三地区',
    '能川地区',
    '仙封地区',
    '深気地区',
    '葵弓地区',
    '雅吉地区',
    '匂肌地区',
    '苫熊地区',
    '虚岻地区',
    '鹿ヶ香地区',
    '海歳地区',
    '渕神尻地区',
    '銘篠地区',
    '渋添地区',
    '本村地区',
    '肱鳴地区',
]

const getUserName = (index) => nameList[index % nameList.length];

const getGroupName = (index) => groupName[index % groupName.length];

const title = [
    'ダッシュボードの警告灯が点灯しない',
    '該当箇所に凹みがあります',
    'バックカメラ用のディスプレイに縦縞が入る',
    '貸与品の携帯電話がロックされてログインできない',
    'ベルトの交換に関して質問',
    '稼働部から異音がする',
    '減速機周辺に錆び付いているところあり',
    '廃車予定の機材について',
    'ボルトの緩みがあります',
    'エアコンが冷房しかつきません',
    'エンストすることがある',
    'キーの差し込み口から異音がする',
    'プリンターから取り込んだ書類のファイルサーバへの転送について',
]
const detail = [
    'お疲れ様です。\\n\\n先週お客様より返却いただいた機材なのですが、返却確認後のチェックを行なったところ、添付写真のようにダッシュボードの警告灯が点灯しなくなっていることがわかりました。\\n貸出前の試運転前ではこのような報告は上がっていないため、貸出中に故障したのではないかと思います。先月まで続いていた東三宅地区の土砂崩れ工事は完了したため、この機材の貸し出し予定はしばらくないかと思われますが、緊急度についてはわかりかねたので、このたび申請させていただきました。\\n\\nお手数ですがご確認の程よろしくお願いいたします。',
]

const getTitle = (index) => title[index % title.length];
const getDetail = (index) => detail[0];

module.exports = {
    getUserName,
    getGroupName,
    getTitle,
    getDetail,
}