const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

// Настройка CORS (для запросов с Flutter-приложения)
app.use(cors());
app.use(express.json());
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Что-то пошло не так');
});

// Настройка подключения к PostgreSQL
const pool = new Pool({
  user: '2024_psql_u_usr',         // Имя пользователя базы данных
  host: '5.183.188.132',           // Хост базы данных
  database: '2024_psql_den',       // Имя базы данных
  password: 'P4dniNJekVrKaEp5',    // Пароль
  port: 5432,                      // Порт PostgreSQL
});

// Убедитесь, что у вас настроен путь для доступа к загруженным файлам
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Убедитесь, что папка для загрузки файлов существует
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  console.log('Папка "uploads" не существует, создаю...');
  fs.mkdirSync(uploadDir);
}

// Конфигурация multer
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname));
    }
  }),
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Неподдерживаемый формат файла'), false);
    }
  }
});

// Корневой маршрут
app.get('/', (req, res) => {
  res.send('Сервер работает! Добро пожаловать!');
});

// Пример маршрута для получения данных из базы
app.get('/data', async (req, res) => {
  try {
    console.log('Выполняется запрос: SELECT * FROM users');
    const result = await pool.query('SELECT * FROM users');
    console.log('Результат запроса:', result.rows);
    res.json(result.rows);
  } catch (err) {
    console.error('Ошибка при выполнении запроса:', err);
    res.status(500).send('Ошибка при получении данных');
  }
});

// Маршрут для регистрации пользователя
app.post('/register', async (req, res) => {
  console.log('Полученные данные:', req.body); // Отладка
  const { user_phone_number, user_password } = req.body;

  if (!user_phone_number || !user_password) {
    return res.status(400).send('Телефон и пароль обязательны');
  }

  try {
    // Проверяем, существует ли уже пользователь с указанным номером телефона
    const existingUser = await pool.query(
      'SELECT user_id FROM users WHERE user_phone_number = $1',
      [user_phone_number]
    );

    if (existingUser.rows.length > 0) {
      // Если пользователь с таким номером телефона существует, возвращаем ошибку
      return res.status(400).json({
        message: 'Такой номер телефона уже зарегистрирован',
      });
    }

    // Вставляем данные пользователя и получаем его ID
    const result = await pool.query(
      'INSERT INTO users (user_phone_number, user_password) VALUES ($1, $2) RETURNING user_id',
      [user_phone_number, user_password]
    );

    const userId = result.rows[0].user_id;

    // Формируем значения для user_acctag и user_name
    const userAcctag = `@user${userId}`;
    const userName = `Пользователь ${userId}`;

    // Обновляем запись пользователя с user_acctag и user_name
    await pool.query(
      'UPDATE users SET user_acctag = $1, user_name = $2 WHERE user_id = $3',
      [userAcctag, userName, userId]
    );

    // Возвращаем user_id в ответе
    res.status(201).json({
      message: 'Пользователь успешно зарегистрирован',
      user_id: userId, // Добавляем user_id в ответ
    });
  } catch (err) {
    console.error('Ошибка при регистрации пользователя:', err);
    res.status(500).send('Ошибка при регистрации');
  }
});

// Маршрут для входа
app.post('/login', async (req, res) => {
  const { identifier, user_password } = req.body;

  if (!identifier || !user_password) {
    return res.status(400).json({ message: 'Логин и пароль обязательны' });
  }

  try {
    // Получаем данные пользователя по номеру телефона или user_acctag
    const result = await pool.query(
      'SELECT user_id, user_password FROM users WHERE user_phone_number = $1 OR user_acctag = $1',
      [identifier]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Неверные учетные данные' });
    }

    const user = result.rows[0];

    // Проверяем, совпадает ли введенный пароль с паролем в базе данных
    if (user.user_password !== user_password) {
      return res.status(400).json({ message: 'Неверные учетные данные' });
    }

    // Если все верно, возвращаем user_id
    res.status(200).json({ message: 'Успешный вход', user_id: user.user_id });

  } catch (err) {
    console.error('Ошибка при выполнении запроса:', err);
    res.status(500).json({ message: 'Ошибка при проверке данных' });
  }
});

// Маршрут для загрузки аватарки пользователя
app.post('/upload-avatar/:id', upload.single('avatar'), async (req, res) => {
  const userId = req.params.id;

  if (!req.file) {
    console.log('Ошибка: файл не был загружен');
    return res.status(400).json({ message: 'Файл не загружен' });
  }

  console.log(`Загружен файл с именем: ${req.file.filename}`);

  try {
    const avatarPath = `/uploads/${req.file.filename}`;
    console.log(`Путь к аватарке: ${avatarPath}`);

    // Обновляем путь к аватарке в базе данных
    const result = await pool.query(
      'UPDATE users SET avatar_url = $1 WHERE user_id = $2 RETURNING *',
      [avatarPath, userId]
    );

    if (result.rowCount === 0) {
      console.error(`Ошибка: пользователь с ID ${userId} не найден`);
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    res.status(200).json({
      message: 'Аватарка успешно обновлена',
      avatar_url: avatarPath,
    });
  } catch (err) {
    console.error('Ошибка при загрузке аватарки:', err);
    res.status(500).json({ message: 'Ошибка при загрузке аватарки' });
  }
});

// Запуск сервера
app.listen(port, () => {
  console.log(`Сервер работает на http://95.163.223.203:${port}`);
});
