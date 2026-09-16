package middleware

import (
	"errors"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

// MaxBodyBytes 是 API 請求 body 的上限（20MB）。
const MaxBodyBytes int64 = 20 << 20

// MaxAIBodyBytes 是 AI 端點的上限（1MB）。AI 只收抽樣資料，
// 不該有人把整份資料送上來。
const MaxAIBodyBytes int64 = 1 << 20

// BodyLimit 限制請求 body 大小；Content-Length 已超過就直接回 413，
// 否則包一層 MaxBytesReader，讀超過時由 handler 以 IsBodyTooLarge 判斷。
func BodyLimit(limit int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.ContentLength > limit {
			c.AbortWithStatusJSON(http.StatusRequestEntityTooLarge, gin.H{"error": "request body too large"})
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, limit)
		c.Next()
	}
}

// IsBodyTooLarge 判斷錯誤是否來自 MaxBytesReader 超過上限。
func IsBodyTooLarge(err error) bool {
	var mbe *http.MaxBytesError
	return errors.As(err, &mbe)
}

// IPLimiter 以 client IP 為單位的 token bucket。
type IPLimiter struct {
	mu      sync.Mutex
	entries map[string]*ipEntry
	limit   rate.Limit
	burst   int
}

type ipEntry struct {
	lim      *rate.Limiter
	lastSeen time.Time
}

// idleTTL 閒置超過這個時間的 IP 會被清掉，避免 map 無限成長。
const idleTTL = 10 * time.Minute

// NewIPLimiter：每 IP 每秒 r 個 token，最多累積 burst 個。
func NewIPLimiter(r rate.Limit, burst int) *IPLimiter {
	l := &IPLimiter{entries: map[string]*ipEntry{}, limit: r, burst: burst}
	go l.sweep()
	return l
}

func (l *IPLimiter) get(ip string) *rate.Limiter {
	l.mu.Lock()
	defer l.mu.Unlock()
	e, ok := l.entries[ip]
	if !ok {
		e = &ipEntry{lim: rate.NewLimiter(l.limit, l.burst)}
		l.entries[ip] = e
	}
	e.lastSeen = time.Now()
	return e.lim
}

func (l *IPLimiter) sweep() {
	for range time.Tick(time.Minute) {
		cutoff := time.Now().Add(-idleTTL)
		l.mu.Lock()
		for ip, e := range l.entries {
			if e.lastSeen.Before(cutoff) {
				delete(l.entries, ip)
			}
		}
		l.mu.Unlock()
	}
}

// Allow 消耗一個 token。
func (l *IPLimiter) Allow(ip string) bool { return l.get(ip).Allow() }

// Exhausted 只檢查不消耗（用於「失敗才扣」的情境）。
func (l *IPLimiter) Exhausted(ip string) bool { return l.get(ip).Tokens() < 1 }

// Middleware 每個請求消耗一個 token，用完回 429。
func (l *IPLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !l.Allow(c.ClientIP()) {
			abortTooMany(c)
			return
		}
		c.Next()
	}
}

func abortTooMany(c *gin.Context) {
	c.Header("Retry-After", "60")
	c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "too many requests"})
}
