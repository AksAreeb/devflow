create table users (
  id serial primary key,
  email text not null unique,
  name text not null,
  password_hash text not null
);

create table sessions (
  token text not null,
  user_id integer not null references users (id),
  created_at timestamp not null default now()
);

create table listings (
  id serial primary key,
  owner_id integer not null references users (id),
  title text not null,
  street text not null,
  rent real not null
);

create table units (
  id serial primary key,
  listing_id integer not null references listings (id),
  label text not null,
  bedrooms integer not null,
  available boolean not null default true
);

create table applications (
  id serial primary key,
  listing_id integer not null references listings (id),
  user_id integer not null references users (id),
  phone text,
  message text,
  created_at timestamp not null default now()
);
