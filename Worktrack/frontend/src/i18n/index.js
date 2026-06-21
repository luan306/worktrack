import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const en = {
  sign_in:'Sign in', username:'Username', password:'Password',
  forgot:'Forgot password?', login_btn:'Sign in', login_ldap:'Sign in with LDAP',
  bad_creds:'Invalid username or password', welcome:'Welcome back!',
  daily:'Daily Tasks', requests:'Requests', completed:'Completed',
  dashboard:'Dashboard', users:'Users', settings:'Settings',
  save:'Save', cancel:'Cancel', delete:'Delete', edit:'Edit', create:'Create',
  search:'Search', add:'Add', view:'View', loading:'Loading...',
  confirm_del:'Are you sure?', yes_del:'Yes, delete',
  logout:'Sign out', score:'Score', group:'Group', name:'Name',
  deadline:'Deadline', priority:'Priority', status:'Status',
  assignee:'Assignee', comment:'Comment', send:'Send',
  on_time:'On time', late:'Late', done:'Done', pending:'Pending',
  in_progress:'In progress', assigned:'Assigned', high:'High', medium:'Medium', low:'Low',
  lock_period:'Lock & Reset', lock_confirm:'Lock this period? Scores will be exported to Excel and reset to 0.',
  period:'Period', total_score:'Total Score',
};

const ja = {
  sign_in:'ログイン', username:'ユーザー名', password:'パスワード',
  forgot:'パスワードを忘れた？', login_btn:'ログイン', login_ldap:'LDAPでログイン',
  bad_creds:'ユーザー名またはパスワードが違います', welcome:'おかえりなさい！',
  daily:'日次タスク', requests:'リクエスト', completed:'完了済み',
  dashboard:'ダッシュボード', users:'ユーザー管理', settings:'設定',
  save:'保存', cancel:'キャンセル', delete:'削除', edit:'編集', create:'作成',
  search:'検索', add:'追加', view:'表示', loading:'読み込み中...',
  confirm_del:'本当に削除しますか？', yes_del:'削除する',
  logout:'ログアウト', score:'スコア', group:'グループ', name:'名前',
  deadline:'期限', priority:'優先度', status:'ステータス',
  assignee:'担当者', comment:'コメント', send:'送信',
  on_time:'期限内', late:'遅延', done:'完了', pending:'保留', in_progress:'進行中', assigned:'割当済',
  high:'高', medium:'中', low:'低',
  lock_period:'締め切り & リセット', lock_confirm:'このピリオドを締め切りますか？スコアをExcelに出力し、0にリセットします。',
  period:'ピリオド', total_score:'合計スコア',
};

const vi = {
  sign_in:'Đăng nhập', username:'Tên đăng nhập', password:'Mật khẩu',
  forgot:'Quên mật khẩu?', login_btn:'Đăng nhập', login_ldap:'Đăng nhập qua LDAP',
  bad_creds:'Tên đăng nhập hoặc mật khẩu không đúng', welcome:'Chào mừng trở lại!',
  daily:'CV Hằng ngày', requests:'CV Yêu cầu', completed:'Hoàn thành',
  dashboard:'Dashboard', users:'Quản lý User', settings:'Cài đặt',
  save:'Lưu', cancel:'Huỷ', delete:'Xóa', edit:'Sửa', create:'Tạo mới',
  search:'Tìm kiếm', add:'Thêm', view:'Xem', loading:'Đang tải...',
  confirm_del:'Bạn có chắc muốn xóa?', yes_del:'Xóa luôn',
  logout:'Đăng xuất', score:'Điểm', group:'Nhóm', name:'Tên',
  deadline:'Deadline', priority:'Ưu tiên', status:'Trạng thái',
  assignee:'Người thực hiện', comment:'Ghi chú', send:'Gửi',
  on_time:'Đúng hạn', late:'Quá hạn', done:'Hoàn thành', pending:'Chờ', in_progress:'Đang làm', assigned:'Đã giao',
  high:'Cao', medium:'Trung bình', low:'Thấp',
  lock_period:'Chốt & Reset', lock_confirm:'Chốt kỳ này? Điểm sẽ được xuất Excel và reset về 0.',
  period:'Kỳ', total_score:'Tổng điểm',
};

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ja: { translation: ja }, vi: { translation: vi } },
  lng: localStorage.getItem('lang') || 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
