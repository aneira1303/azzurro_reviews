CREATE TABLE IF NOT EXISTS properties (
  slug VARCHAR(80) PRIMARY KEY,
  label VARCHAR(120) NOT NULL,
  url VARCHAR(255) NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  hash CHAR(40) NOT NULL,
  property_slug VARCHAR(80) NOT NULL,
  reviewer VARCHAR(120),
  country VARCHAR(80),
  score DECIMAL(3,1) NOT NULL,
  title VARCHAR(500),
  positive_text TEXT,
  negative_text TEXT,
  review_date DATE NOT NULL,
  stay_info VARCHAR(255),
  room_type VARCHAR(255),
  source VARCHAR(10) NOT NULL DEFAULT 'booking',
  sentiment VARCHAR(10) NOT NULL,
  pos_topics JSON,
  neg_topics JSON,
  scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_hash (hash),
  KEY idx_prop_date (property_slug, review_date),
  CONSTRAINT fk_prop FOREIGN KEY (property_slug) REFERENCES properties(slug)
);
CREATE TABLE IF NOT EXISTS scrape_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL,
  status VARCHAR(12) NOT NULL,
  details JSON
)
