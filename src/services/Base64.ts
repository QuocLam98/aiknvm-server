import path from 'path'

// Hàm fetch có timeout
const fetchWithTimeout = async (url: string, timeout = 30000): Promise<Response> => {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(id)

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status} - ${response.statusText}`)
    }

    return response
  } catch (err) {
    clearTimeout(id)
    throw new Error(`Failed to fetch ${url}: ${(err as Error).message}`)
  }
}

const imageUrlToBase64 = async (url: string): Promise<{ file: string, type: string, content: Buffer }> => {
  // Tải tệp từ URL
  const res = await fetchWithTimeout(url)
  
  // Lấy dữ liệu tệp dưới dạng ArrayBuffer
  const arrayBuffer = await res.arrayBuffer()
  
  // Chuyển đổi ArrayBuffer thành Buffer
  const buffer = Buffer.from(arrayBuffer)
  
  // Trích xuất tên file từ URL
  const fileName = path.basename(new URL(url).pathname)
  
  // Lấy phần đuôi file (ví dụ: .jpg, .png, .gif, v.v.)
  const fileExtension = path.extname(fileName).toLowerCase() // Đảm bảo là chữ thường

  // Xác định loại MIME từ phần đuôi file
  let mimeType = 'application/octet-stream' // Mặc định là loại generic nếu không xác định được

  switch (fileExtension) {
    // Các loại ảnh
    case '.jpg':
    case '.jpeg':
      mimeType = 'image/jpeg'
      break
    case '.png':
      mimeType = 'image/png'
      break
    case '.gif':
      mimeType = 'image/gif'
      break
    case '.bmp':
      mimeType = 'image/bmp'
      break
    case '.svg':
      mimeType = 'image/svg+xml'
      break
    case '.webp':
      mimeType = 'image/webp'
      break
    
    // Các loại tài liệu văn bản
    case '.txt':
      mimeType = 'text/plain'
      break
    case '.pdf':
      mimeType = 'application/pdf'
      break
    case '.doc':
    case '.docx':
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      break
    
    default:
      break
  }

  // Trả về đối tượng chứa file, type và content (Buffer)
  return {
    file: fileName,
    type: mimeType,
    content: buffer
  }
}


export default imageUrlToBase64